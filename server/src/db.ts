import { DatabaseSync } from 'node:sqlite';
import type { ArchiveMessage, EventType, GameEvent } from './types.js';

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
    `);
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
