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
    // Live style: the mock solver opens with the first bank word that fits, CRANE.
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, aiStyle: 'live' } });
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
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, mode: 'solo', maxAttempts: 2, secret: 'ALPHA' } });
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
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, mode: 'solo', secret: 'ALPHA' } });
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
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, aiIntervalSeconds: 2, aiJitterSeconds: 0, aiSlowdownPerRound: 2, lockoutSeconds: 1, wordBank: ['CRANE', 'SLATE', 'PLANT'], aiPlanGuesses: 2, aiPlanJitter: 0 } });
    await settle(10);
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

describe('prepared scripts and the free pass', () => {
  it('writes a script for every bank word on save, keeps them across a game reset, and plays them', async () => {
    await settle(10); // let the constructor's preparation pass finish (generated, mock mode)
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, wordBank: ['CRANE', 'SLATE', 'PLANT'], aiPlanGuesses: 4, aiPlanJitter: 1 } });
    await settle(10);
    const scripts = svc.state.hackScripts.byWord;
    expect(Object.keys(scripts).sort()).toEqual(['CRANE', 'PLANT', 'SLATE']);
    for (const [word, s] of Object.entries(scripts)) {
      expect(s.source).toBe('generated');
      expect(s.plan[s.plan.length - 1]).toBe(word);
      expect(s.plan.length).toBeGreaterThanOrEqual(3);
      expect(s.plan.length).toBeLessThanOrEqual(5);
    }
    svc.reset('game');
    expect(Object.keys(svc.state.hackScripts.byWord).length).toBe(3);
    svc.setStage('hack');
    const h = svc.state.hack;
    expect(h.ai.plan).toEqual(scripts[h.secret!].plan);
    expect(h.ai.planSource).toBe('generated');
    // The first tick plays the first line of the script, no model call.
    await settle(2100);
    expect(svc.state.hack.ai.guesses[0] ?? svc.state.hack.lastRound?.word).toBeDefined();
  });

  it('a changed bank makes the old scripts stale and rewrites them', async () => {
    await settle(10);
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, wordBank: ['CRANE', 'SLATE'] } });
    await settle(10);
    expect(Object.keys(svc.state.hackScripts.byWord).sort()).toEqual(['CRANE', 'SLATE']);
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, wordBank: ['PLANT', 'BRICK'] } });
    await settle(10);
    expect(Object.keys(svc.state.hackScripts.byWord).sort()).toEqual(['BRICK', 'PLANT']);
  });

  it('lets Jimmy through with the configured text once the adversary has taken every key', async () => {
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, wordBank: ['CRANE', 'SLATE'], aiPlanGuesses: 2, aiPlanJitter: 0, freePass: { enabled: true, text: 'FAILSAFE. KEY RELEASED.' } } });
    await settle(10);
    svc.setStage('hack');
    // Two words, two-guess scripts: the adversary takes each key on its second tick.
    for (let i = 0; i < 6 && svc.state.stage === 'hack'; i++) await settle(2100);
    expect(svc.state.stage).toBe('reveal');
    const h = svc.state.hack;
    expect(h.freePass).toBe(true);
    expect(h.solved).toBe(true);
    expect(h.rounds).toBe(2);
    expect(svc.view().hack.freePass).toBe('FAILSAFE. KEY RELEASED.');
    expect(svc.view().hack.wordsLeft).toBe(0);
  });

  it('without the free pass the bank simply recycles', async () => {
    svc.updateConfig({ ...svc.config, hack: { ...svc.config.hack, wordBank: ['CRANE', 'SLATE'], aiPlanGuesses: 2, aiPlanJitter: 0, freePass: { enabled: false, text: '' } } });
    await settle(10);
    svc.setStage('hack');
    for (let i = 0; i < 6; i++) await settle(2100);
    expect(svc.state.stage).toBe('hack');
    expect(svc.state.hack.rounds).toBeGreaterThanOrEqual(2);
    expect(svc.state.hack.secret).not.toBeNull();
  });
});

describe('the two-layer Ledger', () => {
  it('opens the personnel files with the investigation and keeps the surveillance records hidden', () => {
    svc.setStage('investigation');
    expect(svc.state.ledger).toMatchObject({ layer1: true, layer2: false });
    const files = svc.ledgerFiles();
    expect(files.layer1?.entries.map((e) => e.name)).toEqual(['Mara Voss', 'Elias Mercer', 'Nina Calder', 'Theo Blackwood', 'Celeste Rowan']);
    expect(files.layer2).toBeNull();
    expect(files.locked.layer2).toBe(true);
  });
  it('is not reachable before the investigation', () => {
    expect(() => svc.ledgerFiles()).toThrow(/not reachable/);
    expect(() => svc.releaseLayer2(true)).toThrow(/only be released/);
  });
  it('a GM release opens the surveillance records and pushes the transmission', () => {
    svc.setStage('investigation');
    svc.releaseLayer2(true);
    expect(svc.state.ledger.layer2).toBe(true);
    expect(svc.ledgerFiles().layer2?.incident.timeOfDeath).toBe('2:14 AM');
    expect(svc.state.hints.at(-1)?.text).toBe(svc.config.ledger.layer2ReleasedText);
    expect(db.listEvents(20).some((e) => e.type === 'ledger_release')).toBe(true);
    svc.releaseLayer2(false);
    expect(svc.state.ledger.layer2).toBe(false);
    expect(svc.ledgerFiles().layer2).toBeNull();
  });
  it('a reset of the investigation hides the surveillance records again, and a game reset clears them', () => {
    svc.setStage('investigation');
    svc.releaseLayer2(true);
    svc.reset('investigation');
    expect(svc.state.ledger).toMatchObject({ layer1: true, layer2: false });
    svc.reset('game');
    expect(svc.state.ledger).toMatchObject({ layer1: false, layer2: false });
  });
  it('a save from before the Ledger existed is migrated by stage', () => {
    svc.setStage('investigation');
    const raw = db.getJson<Record<string, unknown>>('state')!;
    delete raw.ledger;
    raw.evidence = { unlocked: { logs: true, audio: true, toxicology: true, manifest: true } };
    db.setJson('state', raw);
    svc.close();
    svc = new GameService(db);
    expect(svc.state.ledger).toEqual({ layer1: true, layer2: false, layer2ReleasedAt: null });
    expect('evidence' in svc.state).toBe(false);
  });
  it('a save from a solved game returns to the investigation without the deduction', () => {
    svc.setStage('investigation');
    const raw = db.getJson<Record<string, unknown>>('state')!;
    raw.stage = 'solved';
    raw.stageTimes = { ...(raw.stageTimes as object), solved: 5 };
    raw.deduction = { attempts: 1, passed: true, lastResult: null, lastAnswers: null };
    raw.report = { markdown: '# x', generatedAt: 1, published: true };
    db.setJson('state', raw);
    svc.close();
    svc = new GameService(db);
    expect(svc.state.stage).toBe('investigation');
    expect('solved' in svc.state.stageTimes).toBe(false);
    expect('deduction' in svc.state).toBe(false);
    expect(svc.state.report).toEqual({ markdown: '# x', generatedAt: 1 });
  });
});
