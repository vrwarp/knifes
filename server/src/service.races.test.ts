import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { violations } from '../test/invariants.js';
import { Db } from './db.js';
import { GameService } from './service.js';
import type { GameConfig } from './types.js';

// Timing races in the word race and around it, on a fake clock: who gets there first, and what
// happens to a timer or a round when the GMs change something under it.

let dir: string;
let db: Db;
let svc: GameService;
beforeEach(() => {
  vi.useFakeTimers();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-race-'));
  db = new Db(path.join(dir, 't.sqlite'));
  svc = new GameService(db);
  edit((c) => Object.assign(c.hack, { mode: 'race', wordBank: ['CRANE', 'SLATE', 'PLANT', 'BRICK'], aiStyle: 'scripted', aiPlanGuesses: 4, aiPlanJitter: 0, aiIntervalSeconds: 10, aiJitterSeconds: 0, aiSlowdownPerRound: 1, maxAttempts: null }));
});
afterEach(() => {
  svc.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

function edit(fn: (c: GameConfig) => void) {
  const c = structuredClone(svc.config);
  fn(c);
  return svc.updateConfig(c);
}
const sound = () => expect(violations(svc.config, svc.state)).toEqual([]);

describe('a fresh key always gets a fresh clock', () => {
  it('after a GM stage reset, the first adversary guess waits a full interval', async () => {
    svc.setStage('hack');
    await vi.advanceTimersByTimeAsync(9_000);
    svc.reset('hack');
    expect(svc.state.hack.ai.nextAt).toBe(Date.now() + 10_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(svc.state.hack.ai.guesses, 'the old round’s timer must not play into the new key').toEqual([]);
    await vi.advanceTimersByTimeAsync(8_100);
    expect(svc.state.hack.ai.guesses).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('after a bank change mid-round, the same', async () => {
    svc.setStage('hack');
    await vi.advanceTimersByTimeAsync(9_500);
    edit((c) => (c.hack.wordBank = ['STORM', 'QUEST', 'ZEBRA']));
    expect(['STORM', 'QUEST', 'ZEBRA']).toContain(svc.state.hack.secret);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(svc.state.hack.ai.guesses).toEqual([]);
    await vi.advanceTimersByTimeAsync(9_100);
    expect(svc.state.hack.ai.guesses).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('after Jimmy runs out of attempts, the next key starts its own interval', async () => {
    edit((c) => (c.hack.maxAttempts = 2));
    svc.setStage('hack');
    await vi.advanceTimersByTimeAsync(9_000);
    svc.hackGuess('ZZZZZ');
    svc.hackGuess('QQQQQ');
    expect(svc.state.hack.lastRound?.result).toBe('exhausted');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(svc.state.hack.ai.guesses).toEqual([]);
    await vi.advanceTimersByTimeAsync(8_100);
    expect(svc.state.hack.ai.guesses).toHaveLength(1);
  });

  it('a restore that changes the bank mid-round redraws and reschedules too', async () => {
    const withOther = edit((c) => (c.hack.wordBank = ['STORM', 'QUEST', 'ZEBRA'])).version;
    edit((c) => (c.hack.wordBank = ['CRANE', 'SLATE', 'PLANT', 'BRICK']));
    svc.setStage('hack');
    await vi.advanceTimersByTimeAsync(9_000);
    svc.restoreConfig(withOther);
    expect(['STORM', 'QUEST', 'ZEBRA']).toContain(svc.state.hack.secret);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(svc.state.hack.ai.guesses).toEqual([]);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe('a round left open never comes back with an old key', () => {
  it('a bank changed while he is back at the gate takes effect when he returns to the race', () => {
    svc.setStage('hack');
    const old = svc.state.hack.secret!;
    svc.setStage('gate');
    edit((c) => (c.hack.wordBank = ['STORM', 'QUEST', 'ZEBRA']));
    svc.gateAttempt(svc.config.gate.code);
    expect(svc.state.stage).toBe('hack');
    expect(['STORM', 'QUEST', 'ZEBRA']).toContain(svc.state.hack.secret);
    expect(svc.state.hack.secret).not.toBe(old);
    sound();
  });
  it('a reset to the intro, then a new bank, then the gate again: the same', () => {
    svc.setStage('hack');
    svc.reset('intro');
    edit((c) => (c.hack.wordBank = ['STORM', 'QUEST', 'ZEBRA']));
    svc.setStage('hack');
    expect(['STORM', 'QUEST', 'ZEBRA']).toContain(svc.state.hack.secret);
  });
  it('editing the bank in solo mode leaves his solo board alone', () => {
    edit((c) => Object.assign(c.hack, { mode: 'solo', secret: 'ALPHA' }));
    svc.setStage('hack');
    svc.hackGuess('BRAVO');
    edit((c) => (c.hack.wordBank = ['STORM', 'QUEST', 'ZEBRA']));
    expect(svc.state.hack.guesses).toEqual(['BRAVO']);
  });
});

describe('who gets there first', () => {
  it('Jimmy types the key in the same millisecond the adversary would have: Jimmy wins, the adversary is silent', async () => {
    edit((c) => (c.hack.aiPlanGuesses = 2));
    svc.setStage('hack');
    await vi.advanceTimersByTimeAsync(10_000 - 1);
    expect(svc.hackGuess(svc.state.hack.secret!).solved).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(svc.state.stage).toBe('reveal');
    expect(svc.state.hack.ai.guesses).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    sound();
  });

  it('the adversary takes the key first: his late guess of the old key is scored against the new one, and he can still win it', async () => {
    edit((c) => (c.hack.aiPlanGuesses = 2));
    svc.setStage('hack');
    const first = svc.state.hack.secret!;
    await vi.advanceTimersByTimeAsync(20_100);
    expect(svc.state.hack.lastRound).toMatchObject({ result: 'ai', word: first });
    const second = svc.state.hack.secret!;
    expect(svc.hackGuess(first).solved).toBe(false);
    expect(svc.hackGuess(second).solved).toBe(true);
    expect(svc.state.stage).toBe('reveal');
    sound();
  });

  it('the last key falls to the adversary as Jimmy types it: the free pass lets him through, and his guess is no error', async () => {
    edit((c) => Object.assign(c.hack, { wordBank: ['CRANE', 'SLATE'], aiPlanGuesses: 2, freePass: { enabled: true, text: 'FAILSAFE' } }));
    svc.setStage('hack');
    for (let i = 0; i < 10 && svc.state.stage === 'hack'; i++) await vi.advanceTimersByTimeAsync(10_000);
    expect(svc.state.stage).toBe('reveal');
    expect(svc.state.hack.freePass).toBe(true);
    expect(svc.hackGuess('CRANE')).toEqual({ solved: true, lockedUntil: null });
    expect(svc.view().hack.freePass).toBe('FAILSAFE');
    sound();
  });

  it('a GM jump out of the race stops the adversary at once, and back in it carries on from the same round', async () => {
    svc.setStage('hack');
    await vi.advanceTimersByTimeAsync(10_100);
    expect(svc.state.hack.ai.guesses).toHaveLength(1);
    const round = svc.state.hack.round;
    svc.setStage('gate');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(svc.state.hack.ai.guesses).toHaveLength(1);
    svc.gateAttempt(svc.config.gate.code);
    expect(svc.state.hack.round).toBe(round);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('a retry in a race (only an old phone would send one) skips no key', () => {
    svc.setStage('hack');
    const before = { secret: svc.state.hack.secret, used: [...svc.state.hack.used] };
    for (let i = 0; i < 20; i++) svc.hackRetry();
    expect(svc.state.hack.secret).toBe(before.secret);
    expect(svc.state.hack.used).toEqual(before.used);
    expect(svc.state.hack.freePass).toBe(false);
  });

  it('a restart mid-race keeps the round and runs exactly one adversary', async () => {
    svc.setStage('hack');
    await vi.advanceTimersByTimeAsync(10_100);
    const round = { secret: svc.state.hack.secret, guesses: [...svc.state.hack.ai.guesses] };
    svc.close();
    expect(vi.getTimerCount()).toBe(0);
    svc = new GameService(db);
    expect(svc.state.hack.secret).toBe(round.secret);
    expect(svc.state.hack.ai.guesses).toEqual(round.guesses);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10_100);
    expect(svc.state.hack.ai.guesses.length).toBe(round.guesses.length + 1);
  });
});

describe('the GM console around the race', () => {
  it('a reset restarts the clock of the stage he is sent back to', async () => {
    svc.setStage('hack');
    await vi.advanceTimersByTimeAsync(300_000);
    svc.reset('hack');
    expect(svc.state.stageTimes.hack).toBe(Date.now());
    svc.setStage('investigation');
    await vi.advanceTimersByTimeAsync(60_000);
    svc.reset('gate');
    expect(svc.state.stage).toBe('gate');
    expect(svc.state.stageTimes.gate).toBe(Date.now());
    sound();
  });
  it('releasing the records twice pushes one transmission; hiding and releasing again pushes another', () => {
    svc.setStage('investigation');
    svc.releaseLayer2(true);
    svc.releaseLayer2(true);
    expect(svc.state.hints).toHaveLength(1);
    svc.releaseLayer2(false);
    expect(svc.state.ledger.layer2ReleasedAt).toBeNull();
    svc.releaseLayer2(true);
    expect(svc.state.hints).toHaveLength(2);
    sound();
  });
  it('a release with the transmission text blanked pushes nothing, and still opens the records', () => {
    edit((c) => (c.ledger.layer2ReleasedText = '   '));
    svc.setStage('investigation');
    svc.releaseLayer2(true);
    expect(svc.state.hints).toEqual([]);
    expect(svc.ledgerFiles().layer2).not.toBeNull();
  });
});
