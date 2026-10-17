import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockSetupReply } from './ai/setup.js';
import { Db } from './db.js';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import { GameService, HttpError } from './service.js';

let dir: string;
let file: string;
let db: Db;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-history-'));
  file = path.join(dir, 'test.sqlite');
  db = new Db(file);
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const edit = (svc: GameService, fn: (c: typeof DEFAULT_CONFIG) => void) => {
  const c = structuredClone(svc.config);
  fn(c);
  return svc.updateConfig(c);
};

describe('configuration history', () => {
  it('starts with one version and appends one per real change', () => {
    const svc = new GameService(db);
    expect(svc.config.version).toBe(1);
    expect(db.listConfigVersions()[0]).toMatchObject({ version: 1, source: 'system', note: 'Initial configuration' });
    edit(svc, (c) => (c.gate.code = 'NEWCODE1'));
    expect(svc.config.version).toBe(2);
    expect(db.listConfigVersions()[0]).toMatchObject({ version: 2, source: 'gm', changes: ['gate.code'] });
    // Saving with nothing changed adds nothing.
    edit(svc, () => undefined);
    expect(db.countConfigVersions()).toBe(2);
  });

  it('cannot change or delete a stored version', () => {
    const svc = new GameService(db);
    edit(svc, (c) => (c.gate.code = 'NEWCODE1'));
    const raw = new DatabaseSync(file);
    expect(() => raw.prepare("UPDATE config_versions SET note = 'x' WHERE version = 1").run()).toThrow(/append-only/);
    expect(() => raw.prepare('DELETE FROM config_versions WHERE version = 1').run()).toThrow(/append-only/);
    expect(() => raw.exec('DELETE FROM config_versions')).toThrow(/append-only/);
    raw.close();
    expect(db.countConfigVersions()).toBe(2);
  });

  it('restores by appending a copy, so the restore can itself be undone', () => {
    const svc = new GameService(db);
    edit(svc, (c) => (c.gate.code = 'SECOND22'));
    edit(svc, (c) => (c.gate.code = 'THIRD333'));
    const detail = svc.configVersion(1);
    expect(detail.diff).toEqual([{ path: 'gate.code', now: '"THIRD333"', then: '"MAGENTA30"' }]);
    svc.restoreConfig(1);
    expect(svc.config.gate.code).toBe('MAGENTA30');
    expect(svc.config.version).toBe(4);
    expect(db.listConfigVersions()[0]).toMatchObject({ version: 4, source: 'restore', note: 'Restored version 1' });
    svc.restoreConfig(3);
    expect(svc.config.gate.code).toBe('THIRD333');
    expect(() => svc.restoreConfig(5)).toThrow(HttpError);
    expect(() => svc.restoreConfig(99)).toThrow(/No version 99/);
  });

  it('keeps the configuration across restarts and imports a pre-history config once', () => {
    const legacy = structuredClone(DEFAULT_CONFIG);
    legacy.gate.code = 'LEGACY77';
    db.setJson('config', legacy);
    let svc = new GameService(db);
    expect(svc.config.gate.code).toBe('LEGACY77');
    expect(db.listConfigVersions()[0].note).toMatch(/Imported/);
    edit(svc, (c) => (c.hack.secret = 'DELTA'));
    svc = new GameService(db);
    expect(svc.config.hack.secret).toBe('DELTA');
    expect(svc.config.version).toBe(2);
    expect(db.countConfigVersions()).toBe(2);
  });

  it('records uploads and removals as versions', () => {
    const svc = new GameService(db);
    svc.attachUpload('photo', 'photo-a.jpg');
    svc.attachUpload('audio', 'audio-b.mp3');
    svc.detachUpload('photo-a.jpg');
    const notes = db.listConfigVersions().map((v) => v.note);
    expect(notes.slice(0, 3)).toEqual(['Removed an upload', 'Uploaded the intercept recording', 'Added a field photo']);
    svc.restoreConfig(3);
    expect(svc.config.geo.photos).toEqual(['photo-a.jpg']);
  });
});

describe('assistant proposals', () => {
  it('validates paths and values before a proposal is stored', () => {
    const svc = new GameService(db);
    expect(() => svc.propose('bad', [{ path: 'gate.nope', value: 1 }])).toThrow(/No such setting/);
    expect(() => svc.propose('bad', [{ path: 'hack.secret', value: 'A1' }])).toThrow(/Invalid value at hack.secret/);
    expect(() => svc.propose('bad', [{ path: 'version', value: 7 }])).toThrow(/managed/);
    expect(db.listProposals()).toHaveLength(0);
  });

  it('applies only when a GM approves, as an assistant version, and only once', () => {
    const svc = new GameService(db);
    const p = svc.propose('Harder radius', [{ path: 'geo.radiusMeters', value: 120 }, { path: 'gate.code', value: 'PHIL2025' }]);
    expect(svc.config.geo.radiusMeters).toBe(DEFAULT_CONFIG.geo.radiusMeters);
    expect(svc.proposals()[0].preview).toEqual([
      { path: 'geo.radiusMeters', now: '200', next: '120' },
      { path: 'gate.code', now: '"MAGENTA30"', next: '"PHIL2025"' },
    ]);
    svc.applyProposal(p.id);
    expect(svc.config.geo.radiusMeters).toBe(120);
    expect(db.listConfigVersions()[0]).toMatchObject({ source: 'assistant', note: 'Assistant: Harder radius', changes: ['geo.radiusMeters', 'gate.code'] });
    expect(db.getProposal(p.id)).toMatchObject({ status: 'applied', appliedVersion: svc.config.version });
    expect(() => svc.applyProposal(p.id)).toThrow(/already applied/);
    const q = svc.propose('x', [{ path: 'gate.code', value: 'OTHER123' }]);
    svc.dismissProposal(q.id);
    expect(() => svc.applyProposal(q.id)).toThrow(/already dismissed/);
  });

  it('mock mode turns "set PATH to VALUE" into a proposal and otherwise lists readiness', () => {
    const svc = new GameService(db);
    const ctx = { config: () => svc.config, readiness: () => svc.readiness(), history: () => [], propose: svc.propose.bind(svc) };
    expect(mockSetupReply('set gate.code to "ZZTOP123"', ctx)).toMatch(/Proposal #1 sets gate.code/);
    expect(db.getProposal(1)?.changes).toEqual([{ path: 'gate.code', value: 'ZZTOP123' }]);
    expect(mockSetupReply('set geo.radiusMeters to 90', ctx)).toMatch(/Proposal #2/);
    expect(db.getProposal(2)?.changes[0].value).toBe(90);
    const reply = mockSetupReply('what is left?', ctx);
    expect(reply).toMatch(/No target pin is set/);
    expect(reply).toMatch(/No field photos/);
  });
});
