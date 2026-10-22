import { arg, callLog, scenario, until } from '../test/live.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Db } from './db.js';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import { GameService } from './service.js';
import type { GameConfig } from './types.js';

// The word-race adversary on a live credential: scripts written by the model ahead of time, live
// turn-by-turn guesses, and every way a model answer can be late, wrong or overtaken.

let dir: string;
let db: Db;
let svc: GameService | null;

const RACE = (c: GameConfig) => {
  Object.assign(c.hack, { mode: 'race', wordBank: ['CRANE', 'SLATE', 'PLANT'], aiStyle: 'scripted', aiPlanGuesses: 3, aiPlanJitter: 0, aiIntervalSeconds: 1, aiJitterSeconds: 0, aiSlowdownPerRound: 1 });
};
function boot(mutate: (c: GameConfig) => void = RACE): GameService {
  const c = structuredClone(DEFAULT_CONFIG);
  mutate(c);
  db.appendConfig(c, 'system', 'test seed', []);
  svc = new GameService(db);
  return svc;
}
const events = (type: string) => db.recentEvents(500).filter((e) => e.type === type);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-opp-'));
  db = new Db(path.join(dir, 't.sqlite'));
  svc = null;
  scenario({ rules: [{ when: { prompt: 'Key: ' }, do: { text: '', structured: 'planner' } }], default: { text: '', structured: 'guesser' } });
});
afterEach(async () => {
  svc?.close();
  // Let a model call still in flight finish against the closed service before the database goes.
  await new Promise((r) => setTimeout(r, 200));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('scripted adversary, live', () => {
  it('writes a model script for every key at boot, on the configured model, and plays it', async () => {
    const log = callLog();
    const s = boot();
    await until(() => !s.state.hackScripts.busy && Object.keys(s.state.hackScripts.byWord).length === 3, 20_000, 'scripts');
    for (const [word, script] of Object.entries(s.state.hackScripts.byWord)) {
      expect(script.source).toBe('ai');
      expect(script.plan).toHaveLength(3);
      expect(script.plan.at(-1)).toBe(word);
      expect(new Set(script.plan).size).toBe(3);
    }
    const turns = log().filter((t) => /Key: /.test(t.prompt));
    expect(turns).toHaveLength(3);
    for (const t of turns) {
      expect(arg(t, '--model')).toBe('claude-sonnet-5-5');
      expect(arg(t, '--max-turns')).toBe('2');
      expect(t.argv).toContain('--thinking=adaptive');
      expect(JSON.parse(arg(t, '--json-schema')!)).toMatchObject({ required: ['guesses'] });
    }
    expect(events('hack_ai_plan').every((e) => e.payload.prepared === true && e.payload.source === 'ai')).toBe(true);
    expect(events('hack_scripts').at(-1)?.payload).toMatchObject({ ready: 3, total: 3, live: true });

    s.setStage('hack');
    const word = s.state.hack.secret!;
    const plan = s.state.hackScripts.byWord[word].plan;
    expect(s.state.hack.ai.plan).toEqual(plan);
    await until(() => s.state.hack.rounds === 1, 10_000, 'the adversary to take the key');
    const guesses = events('hack_ai_guess').map((e) => e.payload);
    expect(guesses.map((g) => g.guess)).toEqual(plan);
    expect(guesses.every((g) => g.source === 'script')).toBe(true);
    expect(s.state.hack.lastRound).toMatchObject({ result: 'ai', word, aiAttempts: 3 });
    expect(s.state.hack.secret).not.toBe(word);
  }, 40_000);

  it('a script the model gets wrong falls back to a generated one, word by word', async () => {
    scenario({ rules: [{ when: { prompt: 'Key: ' }, do: { text: '', structured: { guesses: ['NOPE', 'ALSO'] } } }] });
    const s = boot();
    await until(() => !s.state.hackScripts.busy && Object.keys(s.state.hackScripts.byWord).length === 3, 20_000, 'scripts');
    expect(Object.values(s.state.hackScripts.byWord).every((x) => x.source === 'generated')).toBe(true);
    expect(events('ai_error').filter((e) => e.payload.where === 'opponent_plan')).toHaveLength(3);
    expect(events('hack_scripts').at(-1)?.payload).toMatchObject({ ready: 3, total: 3 });
  }, 30_000);

  it('a bank saved while the scripts are being written gets its own scripts once that pass ends', async () => {
    scenario({ rules: [{ when: { prompt: 'Key: ' }, do: { delayMs: 300, text: '', structured: 'planner' } }] });
    const s = boot();
    await until(() => s.state.hackScripts.busy, 5000, 'preparation to start');
    const c = structuredClone(s.config);
    c.hack.wordBank = ['BRICK', 'STORM', 'QUEST'];
    s.updateConfig(c);
    await until(() => !s.state.hackScripts.busy && ['BRICK', 'STORM', 'QUEST'].every((w) => s.state.hackScripts.byWord[w]), 25_000, 'scripts for the new bank');
    expect(Object.keys(s.state.hackScripts.byWord).sort()).toEqual(['BRICK', 'QUEST', 'STORM']);
    expect(Object.values(s.state.hackScripts.byWord).every((x) => x.source === 'ai')).toBe(true);
  }, 40_000);

  it('rewriting the scripts replaces every one with a fresh model script', async () => {
    const s = boot();
    await until(() => !s.state.hackScripts.busy && Object.keys(s.state.hackScripts.byWord).length === 3, 20_000, 'scripts');
    const before = Object.fromEntries(Object.entries(s.state.hackScripts.byWord).map(([w, x]) => [w, x.at]));
    await new Promise((r) => setTimeout(r, 20));
    s.regenerateScripts();
    await until(() => !s.state.hackScripts.busy && Object.entries(s.state.hackScripts.byWord).every(([w, x]) => x.at > before[w]), 20_000, 'rewritten scripts');
    expect(events('gm_action').some((e) => e.payload.action === 'regenerate_scripts')).toBe(true);
  }, 40_000);

  it('a key with no prepared script is planned by the model on the first tick', async () => {
    const s = boot();
    await until(() => !s.state.hackScripts.busy, 20_000, 'boot scripts');
    s.state.hackScripts.byWord = {};
    s.setStage('hack');
    expect(s.state.hack.ai.plan).toBeNull();
    await until(() => s.state.hack.ai.plan !== null || s.state.hack.rounds > 0, 10_000, 'a plan');
    const planned = events('hack_ai_plan').filter((e) => e.payload.prepared === undefined);
    expect(planned).toHaveLength(1);
    expect(planned[0].payload).toMatchObject({ round: 1, source: 'ai' });
  }, 30_000);

  it('Jimmy winning while the model writes the plan drops the late plan', async () => {
    scenario({ rules: [{ when: { prompt: 'Key: ' }, do: { delayMs: 1500, text: '', structured: 'planner' } }] });
    const s = boot((c) => {
      RACE(c);
      c.hack.aiStyle = 'scripted';
    });
    await until(() => !s.state.hackScripts.busy, 30_000, 'boot scripts');
    s.state.hackScripts.byWord = {};
    s.setStage('hack');
    await until(() => s.state.hack.ai.thinking, 5000, 'the adversary to start thinking');
    expect(s.hackGuess(s.state.hack.secret!).solved).toBe(true);
    await new Promise((r) => setTimeout(r, 2500));
    expect(s.state.stage).toBe('reveal');
    expect(s.state.hack.ai.guesses).toEqual([]);
    expect(s.state.hack.ai.plan).toBeNull();
    expect(events('hack_ai_guess')).toHaveLength(0);
  }, 40_000);
});

describe('live-style adversary', () => {
  const LIVE = (c: GameConfig) => {
    RACE(c);
    c.hack.aiStyle = 'live';
  };

  it('asks the model for every guess and plays what it answers', async () => {
    const log = callLog();
    const s = boot(LIVE);
    s.setStage('hack');
    await until(() => events('hack_ai_guess').length >= 2, 10_000, 'two guesses');
    const guesses = events('hack_ai_guess').map((e) => e.payload);
    expect(guesses.every((g) => g.source === 'ai')).toBe(true);
    const turns = log().filter((t) => /The key is 5 letters/.test(t.prompt));
    expect(turns.length).toBeGreaterThanOrEqual(2);
    expect(turns[1].prompt).toContain(`Guess 1: ${guesses[0].guess} ->`);
    expect(turns[0].argv).toContain('--thinking=adaptive');
  }, 30_000);

  it('a repeated or malformed model guess is replaced by the solver, so the race never stalls', async () => {
    scenario({ default: { text: '', structured: { guess: 'not-a-word-at-all' } } });
    const s = boot(LIVE);
    s.setStage('hack');
    await until(() => events('hack_ai_guess').length >= 2, 10_000, 'two guesses');
    expect(events('hack_ai_guess').slice(0, 2).every((e) => e.payload.source === 'solver')).toBe(true);
    expect(events('ai_error').filter((e) => e.payload.where === 'opponent').length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('a guess the model is still writing when Jimmy wins is dropped', async () => {
    scenario({ default: { delayMs: 1500, text: '', structured: 'guesser' } });
    const s = boot(LIVE);
    s.setStage('hack');
    await until(() => s.state.hack.ai.thinking, 5000, 'thinking');
    expect(s.hackGuess(s.state.hack.secret!).solved).toBe(true);
    await new Promise((r) => setTimeout(r, 2500));
    expect(s.state.hack.ai.guesses).toEqual([]);
    expect(s.state.hack.ai.thinking).toBe(false);
    expect(events('hack_ai_guess')).toHaveLength(0);
  }, 30_000);

  it('a guess the model is still writing when the GM resets the puzzle is dropped, and the new round runs', async () => {
    scenario({ default: { delayMs: 1200, text: '', structured: 'guesser' } });
    const s = boot(LIVE);
    s.setStage('hack');
    await until(() => s.state.hack.ai.thinking, 5000, 'thinking');
    s.reset('hack');
    const round = s.state.hack.round;
    await until(() => events('hack_ai_guess').length >= 1, 10_000, 'a guess in the new round');
    expect(s.state.hack.round).toBe(round);
    // Exactly one guess per tick: the abandoned request did not add a second one.
    expect(s.state.hack.ai.guesses.length).toBe(events('hack_ai_guess').length);
  }, 30_000);
});
