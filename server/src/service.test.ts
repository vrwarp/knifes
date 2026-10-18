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

  it('the opponent guesses on the clock and wins the round, and the next word is drawn at once', async () => {
    svc.setStage('hack');
    const first = svc.state.hack.secret!;
    await settle(2100);
    if (first !== 'CRANE') {
      expect(svc.state.hack.ai.guesses).toEqual(['CRANE']);
      await settle(2100);
    }
    // The losing round is already gone: a fresh word, empty boards, the banner remembers the loss.
    const h = svc.state.hack;
    expect(h.round).toBe(2);
    expect(h.secret).not.toBe(first);
    expect(h.ai.guesses).toEqual([]);
    expect(h.roundResult).toBeNull();
    expect(h.lockedUntil).toBeNull();
    expect(h.rounds).toBe(1);
    expect(h.lastRound).toMatchObject({ result: 'ai', word: first, round: 1 });
    const v = svc.view().hack;
    expect(v.lastRound?.word).toBe(first);
    expect(v.lastWord).toBeNull();
    expect(JSON.stringify(v)).not.toContain(h.secret!);
    // Jimmy can guess straight away.
    expect(svc.hackGuess(h.secret!).solved).toBe(true);
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

  it('with a cap, running out of attempts also rolls into the next word', async () => {
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, maxAttempts: 6 } });
    svc.setStage('hack');
    const word = svc.state.hack.secret!;
    const wrong = word === 'CRANE' ? 'SLATE' : 'CRANE';
    for (let i = 0; i < 6; i++) svc.hackGuess(wrong);
    expect(svc.state.hack.round).toBe(2);
    expect(svc.state.hack.lastRound).toMatchObject({ result: 'exhausted', word });
    expect(svc.state.hack.guesses).toEqual([]);
  });

  it('solo mode keeps the lockout after a failed round', async () => {
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, mode: 'solo', maxAttempts: 2 } });
    svc.setStage('hack');
    svc.hackGuess('CRANE');
    svc.hackGuess('CRANE');
    expect(svc.state.hack.lockedUntil).not.toBeNull();
    expect(() => svc.hackGuess('ALPHA')).toThrow(/locked/i);
    await settle(1100);
    svc.hackRetry();
    expect(svc.hackGuess('ALPHA').solved).toBe(true);
  });

  it('a stage reset re-draws and drops the old timer', async () => {
    svc.setStage('hack');
    svc.reset('hack');
    expect(svc.state.hack.round).toBe(1);
    expect(svc.state.hack.ai.guesses).toEqual([]);
    await settle(2100);
    // One guess landed: either it is on the board, or it was the word and the next round already began.
    expect(svc.state.hack.ai.guesses.length + svc.state.hack.rounds).toBe(1);
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

describe('unlimited attempts', () => {
  it('neither side is ever locked out; the round ends only on a solve', async () => {
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, maxAttempts: null, wordBank: ['CRANE', 'SLATE', 'PLANT', 'BRICK', 'STORM', 'QUEST', 'ZEBRA', 'MOUND'] } });
    svc.setStage('hack');
    const word = svc.state.hack.secret!;
    const wrong = word === 'CRANE' ? 'SLATE' : 'CRANE';
    for (let i = 0; i < 9; i++) svc.hackGuess(wrong);
    expect(svc.state.hack.guesses.length).toBe(9);
    expect(svc.state.hack.lockedUntil).toBeNull();
    expect(svc.view().hack.maxAttempts).toBeNull();
    expect(svc.view().hack.ai?.exhausted).toBe(false);
  });
});

describe('slowdown per round', () => {
  it('waits longer for the first guess after each lost round', async () => {
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, aiIntervalSeconds: 2, aiJitterSeconds: 0, aiSlowdownPerRound: 2, lockoutSeconds: 1, wordBank: ['CRANE', 'SLATE', 'PLANT'] } });
    svc.setStage('hack');
    const h0 = svc.state.hack;
    expect(h0.ai.nextAt! - h0.ai.lastAt!).toBe(2000);
    // Lose the round by letting the opponent solve: at most three guesses with this bank.
    for (let i = 0; i < 3 && svc.state.hack.rounds === 0; i++) await settle(2100);
    const h1 = svc.state.hack;
    expect(h1.rounds).toBe(1);
    expect(h1.round).toBe(2);
    expect(h1.ai.nextAt! - h1.ai.lastAt!).toBe(4000);
  });
});
