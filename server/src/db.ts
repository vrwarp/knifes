import { DatabaseSync } from 'node:sqlite';
import type { ArchiveMessage, EventType, GameEvent } from './types.js';

export type ConfigSource = 'gm' | 'assistant' | 'restore' | 'upload' | 'system';
export interface ConfigVersionMeta {
  version: number;
  ts: number;
  source: ConfigSource;
  note: string;
  /** Dotted paths that differ from the previous version. */
  changes: string[];
}
export interface AssistantMessage {
  id: number;
  ts: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: Record<string, unknown>;
}
export interface ProposalChange {
  path: string;
  value: unknown;
}
export interface Proposal {
  id: number;
  ts: number;
  summary: string;
  changes: ProposalChange[];
  status: 'pending' | 'applied' | 'dismissed';
  appliedVersion: number | null;
  decidedAt: number | null;
}
type ProposalRow = { id: number; ts: number; summary: string; changes: string; status: Proposal['status']; applied_version: number | null; decided_at: number | null };
const toProposal = (r: ProposalRow): Proposal => ({
  id: r.id,
  ts: r.ts,
  summary: r.summary,
  changes: JSON.parse(r.changes) as ProposalChange[],
  status: r.status,
  appliedVersion: r.applied_version,
  decidedAt: r.decided_at,
});

export class Db {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        meta TEXT
      );
      -- Every configuration ever saved, oldest first. Append-only: the triggers below refuse
      -- to change or remove a row, so any earlier version can always be restored.
      CREATE TABLE IF NOT EXISTS config_versions (
        version INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        source TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        changes TEXT NOT NULL DEFAULT '[]',
        config TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS config_versions_no_update BEFORE UPDATE ON config_versions
        BEGIN SELECT RAISE(ABORT, 'configuration history is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS config_versions_no_delete BEFORE DELETE ON config_versions
        BEGIN SELECT RAISE(ABORT, 'configuration history is append-only'); END;
      CREATE TABLE IF NOT EXISTS assistant_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        meta TEXT
      );
      CREATE TABLE IF NOT EXISTS assistant_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        summary TEXT NOT NULL,
        changes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        applied_version INTEGER,
        decided_at INTEGER
      );
    `);
  }

  // ---- configuration versions (append-only) ----------------------------------------------

  /** Append a configuration and return its version number. The stored JSON carries that number. */
  appendConfig(config: { version: number }, source: ConfigSource, note: string, changes: string[], ts = Date.now()): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM config_versions').get() as { next: number };
    const version = Number(row.next);
    const stored = { ...config, version };
    this.db
      .prepare('INSERT INTO config_versions (version, ts, source, note, changes, config) VALUES (?, ?, ?, ?, ?, ?)')
      .run(version, ts, source, note, JSON.stringify(changes), JSON.stringify(stored));
    return version;
  }

  latestConfig<T>(): T | null {
    const row = this.db.prepare('SELECT config FROM config_versions ORDER BY version DESC LIMIT 1').get() as { config: string } | undefined;
    return row ? (JSON.parse(row.config) as T) : null;
  }

  getConfigVersion<T>(version: number): (ConfigVersionMeta & { config: T }) | null {
    const row = this.db.prepare('SELECT version, ts, source, note, changes, config FROM config_versions WHERE version = ?').get(version) as
      | { version: number; ts: number; source: ConfigSource; note: string; changes: string; config: string }
      | undefined;
    if (!row) return null;
    return { version: row.version, ts: row.ts, source: row.source, note: row.note, changes: JSON.parse(row.changes) as string[], config: JSON.parse(row.config) as T };
  }

  listConfigVersions(limit = 50, before?: number): ConfigVersionMeta[] {
    const rows = this.db
      .prepare('SELECT version, ts, source, note, changes FROM config_versions WHERE version < ? ORDER BY version DESC LIMIT ?')
      .all(before ?? Number.MAX_SAFE_INTEGER, limit) as { version: number; ts: number; source: ConfigSource; note: string; changes: string }[];
    return rows.map((r) => ({ version: r.version, ts: r.ts, source: r.source, note: r.note, changes: JSON.parse(r.changes) as string[] }));
  }

  countConfigVersions(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM config_versions').get() as { n: number }).n);
  }

  // ---- setup assistant -------------------------------------------------------------------

  addAssistantMessage(role: 'user' | 'assistant' | 'system', text: string, meta?: Record<string, unknown>, ts = Date.now()): AssistantMessage {
    const res = this.db
      .prepare('INSERT INTO assistant_messages (ts, role, text, meta) VALUES (?, ?, ?, ?)')
      .run(ts, role, text, meta ? JSON.stringify(meta) : null);
    return { id: Number(res.lastInsertRowid), ts, role, text, meta };
  }

  listAssistantMessages(limit = 300): AssistantMessage[] {
    const rows = this.db
      .prepare('SELECT id, ts, role, text, meta FROM (SELECT * FROM assistant_messages ORDER BY id DESC LIMIT ?) ORDER BY id ASC')
      .all(limit) as { id: number; ts: number; role: AssistantMessage['role']; text: string; meta: string | null }[];
    return rows.map((r) => ({ id: r.id, ts: r.ts, role: r.role, text: r.text, meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : undefined }));
  }

  clearAssistantMessages(): void {
    this.db.exec('DELETE FROM assistant_messages');
  }

  addProposal(summary: string, changes: ProposalChange[], ts = Date.now()): Proposal {
    const res = this.db.prepare('INSERT INTO assistant_proposals (ts, summary, changes) VALUES (?, ?, ?)').run(ts, summary, JSON.stringify(changes));
    return { id: Number(res.lastInsertRowid), ts, summary, changes, status: 'pending', appliedVersion: null, decidedAt: null };
  }

  getProposal(id: number): Proposal | null {
    const r = this.db.prepare('SELECT * FROM assistant_proposals WHERE id = ?').get(id) as ProposalRow | undefined;
    return r ? toProposal(r) : null;
  }

  listProposals(limit = 50): Proposal[] {
    const rows = this.db.prepare('SELECT * FROM assistant_proposals ORDER BY id DESC LIMIT ?').all(limit) as ProposalRow[];
    return rows.map(toProposal);
  }

  decideProposal(id: number, status: 'applied' | 'dismissed', appliedVersion: number | null, ts = Date.now()): void {
    this.db.prepare('UPDATE assistant_proposals SET status = ?, applied_version = ?, decided_at = ? WHERE id = ?').run(status, appliedVersion, ts, id);
  }

  getJson<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }

  setJson(key: string, value: unknown): void {
    this.db
      .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  addEvent(type: EventType, payload: Record<string, unknown>, ts = Date.now()): GameEvent {
    const res = this.db.prepare('INSERT INTO events (ts, type, payload) VALUES (?, ?, ?)').run(ts, type, JSON.stringify(payload));
    return { id: Number(res.lastInsertRowid), ts, type, payload };
  }

  listEvents(limit = 500, afterId = 0): GameEvent[] {
    const rows = this.db
      .prepare('SELECT id, ts, type, payload FROM events WHERE id > ? ORDER BY id ASC LIMIT ?')
      .all(afterId, limit) as { id: number; ts: number; type: EventType; payload: string }[];
    return rows.map((r) => ({ id: r.id, ts: r.ts, type: r.type, payload: JSON.parse(r.payload) as Record<string, unknown> }));
  }

  clearEvents(): void {
    this.db.exec('DELETE FROM events');
  }

  addArchive(role: ArchiveMessage['role'], text: string, meta?: Record<string, unknown>, ts = Date.now()): ArchiveMessage {
    const res = this.db
      .prepare('INSERT INTO archive (ts, role, text, meta) VALUES (?, ?, ?, ?)')
      .run(ts, role, text, meta ? JSON.stringify(meta) : null);
    return { id: Number(res.lastInsertRowid), ts, role, text, meta };
  }

  listArchive(limit = 400): ArchiveMessage[] {
    const rows = this.db
      .prepare('SELECT id, ts, role, text, meta FROM archive ORDER BY id ASC LIMIT ?')
      .all(limit) as { id: number; ts: number; role: ArchiveMessage['role']; text: string; meta: string | null }[];
    return rows.map((r) => ({ id: r.id, ts: r.ts, role: r.role, text: r.text, meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : undefined }));
  }

  clearArchive(): void {
    this.db.exec('DELETE FROM archive');
  }

  close(): void {
    this.db.close();
  }
}
