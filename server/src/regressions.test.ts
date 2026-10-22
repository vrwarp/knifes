import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockArchiveReply } from './ai/archive.js';
import { mockSetupReply } from './ai/setup.js';
import { Db } from './db.js';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import { setPath } from './game/configPaths.js';
import { initialState } from './game/state.js';
import { GameService, mergeConfig } from './service.js';
import type { GameConfig } from './types.js';

// One test per defect found while hardening for the party, so none of them comes back.

let dir: string;
let db: Db;
let svc: GameService;
beforeEach(() => {
  vi.useFakeTimers();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-reg-'));
  db = new Db(path.join(dir, 't.sqlite'));
  svc = new GameService(db);
});
afterEach(() => {
  svc.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

const edit = (fn: (c: GameConfig) => void) => {
  const c = structuredClone(svc.config);
  fn(c);
  return svc.updateConfig(c);
};

describe('long evenings', () => {
  it('the GM overview shows the latest events, not the first 400 of the evening', async () => {
    for (let i = 0; i < 450; i++) db.addEvent('gate_attempt', { code: `C${i}`, ok: false, attempt: i });
    const o = await svc.overview();
    expect(o.events).toHaveLength(400);
    expect(o.events.at(-1)?.payload.code).toBe('C449');
    expect(o.events.map((e) => e.id)).toEqual([...o.events.map((e) => e.id)].sort((a, b) => a - b));
  });

  it('the ARCHIVE transcript keeps the latest messages once it is long', () => {
    for (let i = 0; i < 450; i++) db.addArchive(i % 2 ? 'assistant' : 'user', `m${i}`);
    const t = svc.archiveTranscript();
    expect(t.at(-1)?.text).toBe('m449');
    expect(t.map((m) => m.id)).toEqual([...t.map((m) => m.id)].sort((a, b) => a - b));
  });
});

describe('mock ARCHIVE with edited agent names', () => {
  const ctx = (rename: (c: GameConfig) => void) => {
    const config = structuredClone(DEFAULT_CONFIG);
    rename(config);
    const state = initialState();
    state.ledger.layer1 = true;
    return { config, state };
  };
  it('answers when an agent goes by one name', () => {
    const c = ctx((c) => (c.ledger.content.agents[0].name = 'Mara'));
    expect(() => mockArchiveReply('tell me about Elias Mercer', c)).not.toThrow();
    expect(mockArchiveReply('tell me about Elias Mercer', c)).toContain('Systems Architect');
    expect(mockArchiveReply('tell me about mara', c)).toContain('Security Director');
  });
  it('does not match every question to an agent whose name has a double space', () => {
    const c = ctx((c) => (c.ledger.content.agents[0].name = 'Mara  Voss'));
    expect(mockArchiveReply('tell me about Theo Blackwood', c)).toContain('Field Operative');
  });
  it('the service answers instead of reporting a degraded link', async () => {
    edit((c) => (c.ledger.content.agents[0].name = 'Mara'));
    svc.setStage('investigation');
    const { reply } = await svc.archiveSend('tell me about Nina Calder');
    expect(reply.role).toBe('assistant');
    expect(reply.text).toContain('Intelligence Analyst');
  });
});

describe('the free pass and an edited bank', () => {
  it('counts the keys of the bank in play, not how many words were drawn before the edit', () => {
    edit((c) => Object.assign(c.hack, { mode: 'race', wordBank: ['CRANE', 'SLATE', 'PLANT'], aiPlanGuesses: 2, aiPlanJitter: 0, aiIntervalSeconds: 2, aiJitterSeconds: 0, freePass: { enabled: true, text: 'PASS' } }));
    svc.setStage('hack');
    // Two rounds lost to the adversary, the third key in play.
    svc.state.hack.used = ['CRANE', 'SLATE', 'PLANT'];
    svc.state.hack.rounds = 2;
    edit((c) => (c.hack.wordBank = ['BRICK', 'STORM']));
    expect(svc.state.hack.freePass).toBe(false);
    expect(svc.state.stage).toBe('hack');
    expect(['BRICK', 'STORM']).toContain(svc.state.hack.secret);
    expect(svc.view().hack.wordsLeft).toBe(1);
  });
});

describe('transmissions', () => {
  it('two hints pushed in the same millisecond get different ids, in order', () => {
    const a = svc.pushHint('first');
    const b = svc.pushHint('second');
    expect(b.id).toBeGreaterThan(a.id);
    expect(new Set(svc.state.hints.map((h) => h.id)).size).toBe(2);
  });
  it('a hint pushed after the clock steps back still sorts after the last one', () => {
    const a = svc.pushHint('first');
    vi.setSystemTime(Date.now() - 60_000);
    const b = svc.pushHint('second');
    expect(b.id).toBeGreaterThan(a.id);
  });
  it('the records release and its transmission never share an id with a hint pushed at once', () => {
    svc.setStage('investigation');
    svc.releaseLayer2(true);
    const h = svc.pushHint('right after');
    const ids = svc.state.hints.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(h.id).toBe(Math.max(...ids));
  });
});

describe('the phone revision across a restart', () => {
  it('keeps rising even when the clock is behind the last revision', () => {
    svc.pushHint('bump');
    const before = svc.view().rev;
    svc.close();
    vi.setSystemTime(Date.now() - 3_600_000);
    svc = new GameService(db);
    expect(svc.view().rev).toBeGreaterThan(before);
    svc.pushHint('bump again');
    expect(svc.view().rev).toBeGreaterThan(before);
  });
});

describe('configuration paths', () => {
  it('cannot reach Object.prototype through __proto__', () => {
    const original = Object.prototype.propertyIsEnumerable;
    try {
      expect(() => setPath({ a: 1 }, '__proto__.propertyIsEnumerable', 1)).toThrow(/No such setting/);
      expect(Object.prototype.propertyIsEnumerable).toBe(original);
      expect(() => setPath({ a: 1 }, '__proto__', {})).toThrow(/No such setting/);
      expect(() => setPath({ a: { b: 1 } }, 'a.constructor', 1)).toThrow(/No such setting/);
      expect(() => setPath({ a: { b: 1 } }, 'a.toString', 1)).toThrow(/No such setting/);
    } finally {
      Object.prototype.propertyIsEnumerable = original;
    }
  });
  it('the mock assistant turns a __proto__ edit into an explanation, not a pollution', () => {
    const original = Object.prototype.valueOf;
    try {
      const ctx = { config: () => svc.config, readiness: () => svc.readiness(), history: () => [], propose: svc.propose.bind(svc) };
      expect(mockSetupReply('set __proto__.valueOf to 1', ctx)).toMatch(/Could not propose/);
      expect(Object.prototype.valueOf).toBe(original);
    } finally {
      Object.prototype.valueOf = original;
    }
  });
});

describe('the gate code', () => {
  it('refuses a code the phone keyboard cannot type in full', () => {
    expect(() => edit((c) => (c.gate.code = 'WHOWATCHESTHEWATCHERS'))).toThrow(/gate\.code/);
    expect(() => edit((c) => (c.gate.code = '---'))).toThrow(/gate\.code/);
    expect(() => edit((c) => (c.gate.code = 'S30-GHOST-2026'))).not.toThrow();
    expect(svc.gateAttempt).toBeTypeOf('function');
  });
});

describe('a saved configuration that no longer validates', () => {
  it('loses only the offending setting, not every customisation', () => {
    const saved = structuredClone(DEFAULT_CONFIG) as GameConfig;
    saved.gate.code = 'KEPT1';
    saved.geo.target = { lat: 34.6, lng: -118.4 };
    saved.hints.quick.gate = ['custom hint'];
    (saved.hack as unknown as { aiIntervalSeconds: number }).aiIntervalSeconds = 0.2; // below the minimum
    const merged = mergeConfig(saved);
    expect(merged.gate.code).toBe('KEPT1');
    expect(merged.geo.target).toEqual({ lat: 34.6, lng: -118.4 });
    expect(merged.hints.quick.gate).toEqual(['custom hint']);
    expect(merged.hack.aiIntervalSeconds).toBe(DEFAULT_CONFIG.hack.aiIntervalSeconds);
  });
  it('repairs a cross-field rule by resetting the fields involved', () => {
    const saved = structuredClone(DEFAULT_CONFIG) as GameConfig;
    saved.gate.code = 'KEPT2';
    saved.hack.aiIntervalSeconds = 3;
    saved.hack.aiJitterSeconds = 4; // jitter must stay under the interval
    const merged = mergeConfig(saved);
    expect(merged.gate.code).toBe('KEPT2');
    expect(merged.hack.aiJitterSeconds).toBeLessThan(merged.hack.aiIntervalSeconds);
  });
  it('a restart with such a configuration keeps the GMs edits as the live version', () => {
    const saved = structuredClone(DEFAULT_CONFIG) as GameConfig;
    saved.gate.code = 'KEPT3';
    saved.geo.radiusMeters = 1; // below the minimum
    db.appendConfig(saved, 'gm', 'saved by an older build', ['gate.code']);
    svc.close();
    svc = new GameService(db);
    expect(svc.config.gate.code).toBe('KEPT3');
    expect(svc.config.geo.radiusMeters).toBe(DEFAULT_CONFIG.geo.radiusMeters);
  });
});
