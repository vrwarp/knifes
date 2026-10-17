import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Db } from './db.js';
import { GameService } from './service.js';

// The service pulls env.ts, which resolves DATA_DIR at import time; keep it off the repo.
let dir: string;
let db: Db;
let svc: GameService;

beforeEach(() => {
  vi.useFakeTimers();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-svc-'));
  db = new Db(path.join(dir, 't.sqlite'));
  svc = new GameService(db);
  svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, mode: 'race', wordBank: ['CRANE', 'SLATE'], aiIntervalSeconds: 2, aiJitterSeconds: 0, lockoutSeconds: 1 } });
});
afterEach(() => {
  svc.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

const settle = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('word race', () => {
  it('draws a word when the puzzle opens and keeps it off the phone', () => {
    svc.setStage('hack');
    const h = svc.state.hack;
    expect(['CRANE', 'SLATE']).toContain(h.secret);
    expect(h.round).toBe(1);
    const text = JSON.stringify(svc.view());
    expect(text).not.toContain(h.secret);
    expect(svc.view().hack.ai?.attempts).toBe(0);
  });

  it('the opponent guesses on the clock and wins the round, then a new word is drawn', async () => {
    svc.setStage('hack');
    const first = svc.state.hack.secret!;
    await settle(2100);
    expect(svc.state.hack.ai.guesses).toEqual(['CRANE']);
    if (first === 'CRANE') {
      expect(svc.state.hack.ai.solved).toBe(true);
    } else {
      await settle(2100);
      expect(svc.state.hack.ai.guesses).toEqual(['CRANE', 'SLATE']);
      expect(svc.state.hack.ai.solved).toBe(true);
    }
    expect(svc.state.hack.roundResult).toBe('ai');
    expect(svc.state.hack.lockedUntil).not.toBeNull();
    expect(svc.view().hack.lastWord).toBe(first);
    expect(() => svc.hackGuess('CRANE')).toThrow(/locked/i);
    await settle(1100);
    svc.hackRetry();
    expect(svc.state.hack.round).toBe(2);
    expect(svc.state.hack.secret).not.toBe(first);
    expect(svc.state.hack.ai.guesses).toEqual([]);
    expect(svc.state.hack.roundResult).toBeNull();
  });

  it('the player wins by typing the word first, and the opponent stops', async () => {
    svc.setStage('hack');
    const word = svc.state.hack.secret!;
    const r = svc.hackGuess(word);
    expect(r.solved).toBe(true);
    expect(svc.state.stage).toBe('reveal');
    await settle(10_000);
    expect(svc.state.hack.ai.guesses).toEqual([]);
  });

  it('running out of attempts ends the round and reveals the word', async () => {
    svc.setStage('hack');
    const word = svc.state.hack.secret!;
    const wrong = word === 'CRANE' ? 'SLATE' : 'CRANE';
    for (let i = 0; i < 6; i++) svc.hackGuess(wrong);
    expect(svc.state.hack.roundResult).toBe('exhausted');
    expect(svc.view().hack.lastWord).toBe(word);
    await settle(5000);
    expect(svc.state.hack.ai.guesses).toEqual([]);
  });

  it('a stage reset re-draws and drops the old timer', async () => {
    svc.setStage('hack');
    svc.reset('hack');
    expect(svc.state.hack.round).toBe(1);
    expect(svc.state.hack.ai.guesses).toEqual([]);
    await settle(2100);
    expect(svc.state.hack.ai.guesses.length).toBe(1);
  });

  it('solo mode keeps the configured secret and no opponent', async () => {
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, mode: 'solo' } });
    svc.setStage('hack');
    expect(svc.view().hack.ai).toBeNull();
    expect(svc.hackGuess('ALPHA').solved).toBe(true);
    await settle(5000);
    expect(svc.state.hack.ai.guesses).toEqual([]);
  });

  it('rejects a mixed-length bank in race mode', () => {
    expect(() => svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, wordBank: ['CRANE', 'SLATES'] } })).toThrow(/same length/);
  });
});
