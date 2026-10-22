import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { violations } from '../test/invariants.js';
import { Db } from './db.js';
import { DEFAULT_WORD_BANK } from './content/words.js';
import { GameService } from './service.js';

// Whole evenings on a fake clock, at the settings the party will use: how long the race can last,
// that its backstop fires, and that a long night of logs stays small and quick.

let dir: string;
let db: Db;
let svc: GameService;
beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-25T19:00:00-07:00') });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-soak-'));
  db = new Db(path.join(dir, 't.sqlite'));
  svc = new GameService(db);
});
afterEach(() => {
  svc.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('the race at the party settings', () => {
  it('with Jimmy never finding a key, the adversary takes all ten and the free pass lets him through', async () => {
    expect(svc.config.hack).toMatchObject({ mode: 'race', aiStyle: 'scripted', maxAttempts: null, aiIntervalSeconds: 10, aiJitterSeconds: 5, aiSlowdownPerRound: 1.5, aiPlanGuesses: 8, aiPlanJitter: 2 });
    expect(svc.config.hack.freePass.enabled).toBe(true);
    svc.setStage('hack');
    const started = Date.now();
    const roundEnds: number[] = [];
    // 6 to 10 guesses a round, 5 to 15 s apart times 1.5 per lost round: all ten rounds take between
    // 30 s x 113.3 and 150 s x 113.3, so 57 minutes to 4 h 43 m. Budget 5 hours of simulated time.
    for (let i = 0; i < 3600 && svc.state.stage === 'hack'; i++) {
      const rounds = svc.state.hack.rounds;
      await vi.advanceTimersByTimeAsync(5_000);
      if (svc.state.hack.rounds > rounds) roundEnds.push(Date.now() - started);
      expect(violations(svc.config, svc.state)).toEqual([]);
    }
    expect(svc.state.stage).toBe('reveal');
    expect(svc.state.hack.freePass).toBe(true);
    expect(svc.state.hack.rounds).toBe(10);
    expect([...svc.state.hack.used].sort()).toEqual([...DEFAULT_WORD_BANK].sort());
    const minutes = (Date.now() - started) / 60_000;
    // The backstop is an hour at the very least and usually two and a half: on the night a GM skip comes first.
    expect(minutes).toBeGreaterThanOrEqual(56);
    expect(minutes).toBeLessThanOrEqual(285);
    // The first round is quick: half a minute to two and a half, measured on a 5 s poll.
    expect(roundEnds[0] / 1000).toBeGreaterThanOrEqual(30);
    expect(roundEnds[0] / 1000).toBeLessThanOrEqual(155);
    for (let r = 1; r < roundEnds.length; r++) expect(roundEnds[r]).toBeGreaterThan(roundEnds[r - 1]);
    expect(svc.view().hack.freePass).toBe(svc.config.hack.freePass.text);
  }, 120_000);
});

describe('a long evening', () => {
  it('keeps the log, the state and every push small enough for a phone on cellular', async () => {
    svc.start();
    for (let i = 0; i < 6; i++) svc.geoGuess(34.66 + i * 0.01, -118.41);
    svc.geoProceed();
    for (let i = 0; i < 4; i++) svc.gateAttempt(`WRONG${i}`);
    svc.gateAttempt(svc.config.gate.code);
    // Two races lost, the third won, with a wrong guess every 15 seconds.
    for (let i = 0; i < 1000 && svc.state.stage === 'hack'; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
      if (svc.state.stage !== 'hack') break;
      if (svc.state.hack.rounds >= 2 && svc.state.hack.guesses.length >= 3) svc.hackGuess(svc.state.hack.secret!);
      else svc.hackGuess('PLANTER');
    }
    expect(svc.state.stage).toBe('reveal');
    svc.revealContinue();
    const questions = ['tell me about mara', 'tell me about nina', 'where was everyone at 2:14', 'who did it', 'what is the syndicate', 'between 1:00 and 3:00', 'pendelton', 'agents'];
    for (let i = 0; i < 200; i++) {
      if (i === 100) svc.releaseLayer2(true);
      if (i % 8 === 0) svc.pushHint(`Transmission ${i}: hold what they said against what was recorded.`);
      await svc.archiveSend(`${questions[i % questions.length]} (${i})`);
      await vi.advanceTimersByTimeAsync(40_000);
    }
    await svc.generateReport();
    expect(violations(svc.config, svc.state)).toEqual([]);

    const events = db.listEvents(100_000);
    expect(events.length).toBeGreaterThan(400);
    const overview = await svc.overview();
    expect(overview.events.at(-1)!.id).toBe(events.at(-1)!.id);
    const stateBytes = JSON.stringify(svc.state).length;
    const gmPush = JSON.stringify(svc.snapshotMessage()).length;
    const phonePush = JSON.stringify({ type: 'state', player: svc.view() }).length;
    expect(stateBytes).toBeLessThan(100_000);
    expect(gmPush).toBeLessThan(250_000);
    expect(phonePush).toBeLessThan(40_000);
    expect(fs.statSync(path.join(dir, 't.sqlite')).size).toBeLessThan(20_000_000);
    // A save and a push per touch, many times a minute: still well under a frame.
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) svc.setArchiveLocked(i % 2 === 0);
    expect((performance.now() - t0) / 200).toBeLessThan(15);
  }, 120_000);
});
