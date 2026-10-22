import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { secretsFor, violations } from '../test/invariants.js';
import { Db } from './db.js';
import { STAGE_ORDER, type GameConfig, type StageId } from './types.js';
import { GameService, HttpError } from './service.js';

// Random evenings: the phone, the GMs, the clock and the container all acting in any order. After
// every step the game must still be sound, the phone must still know nothing it should not, and what
// is on disk must be what is in memory, so a restart at any moment loses nothing.

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let dir: string;
let db: Db;
let svc: GameService;
beforeEach(() => {
  vi.useFakeTimers();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-fuzz-'));
  db = new Db(path.join(dir, 't.sqlite'));
  svc = new GameService(db);
});
afterEach(() => {
  svc.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

const BANKS = [
  ['CRANE', 'SLATE', 'PLANT'],
  ['STEALTH', 'PHANTOM', 'CIPHERS', 'COURIER'],
  ['BRICK', 'STORM', 'QUEST', 'ZEBRA', 'MOUND'],
];

type Op = { name: string; run: () => unknown };

function evening(seed: number, steps: number): string[] {
  const r = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const log: string[] = [];
  let geoModeChangedLate = false;
  // A cap lowered mid-round below what was already played stops the adversary and ends the round on his next guess.
  let capLoweredInRound: number | null = null;
  const edit = (fn: (c: GameConfig) => void) => {
    const c = structuredClone(svc.config);
    fn(c);
    return svc.updateConfig(c);
  };
  const ops: [number, Op][] = [
    [3, { name: 'start', run: () => svc.start() }],
    [3, { name: 'geo guess near', run: () => svc.geoGuess(34.66 + (r() - 0.5) * 0.01, -118.41 + (r() - 0.5) * 0.01) }],
    [1, { name: 'geo guess far', run: () => svc.geoGuess(-80 + r() * 160, -170 + r() * 340) }],
    [3, { name: 'geo proceed', run: () => svc.geoProceed() }],
    [2, { name: 'gate wrong', run: () => svc.gateAttempt(pick(['NOPE', '', 's30-ghost!!', 'x'.repeat(90)])) }],
    [3, { name: 'gate right', run: () => svc.gateAttempt(svc.config.gate.code.toLowerCase()) }],
    [5, { name: 'hack guess key', run: () => svc.hackGuess(svc.state.hack.secret ?? svc.config.hack.secret) }],
    [6, { name: 'hack guess wrong', run: () => svc.hackGuess(pick(svc.config.hack.wordBank.concat(['ZZZZZ', 'QQQQQQQ'])).toLowerCase()) }],
    [1, { name: 'hack guess bad length', run: () => svc.hackGuess('AB') }],
    [1, { name: 'hack retry', run: () => svc.hackRetry() }],
    [3, { name: 'reveal continue', run: () => svc.revealContinue() }],
    [1, { name: 'ledger', run: () => svc.ledgerFiles() }],
    [3, { name: 'archive', run: () => svc.archiveSend(pick(['where was everyone at 2:14', 'tell me about nina', 'who did it', 'read the surveillance records', 'x'])) }],
    [2, { name: 'gm jump', run: () => svc.setStage(pick(STAGE_ORDER)) }],
    [2, { name: 'gm reset stage', run: () => svc.reset(pick(STAGE_ORDER)) }],
    [1, { name: 'gm reset game', run: () => svc.reset('game') }],
    [2, { name: 'gm hint', run: () => svc.pushHint(pick(['Look at the office.', '   ', 'Call Phil.'])) }],
    [2, { name: 'gm release', run: () => svc.releaseLayer2(r() < 0.7) }],
    [1, { name: 'gm seal', run: () => svc.setArchiveLocked(r() < 0.5) }],
    [1, { name: 'gm new archive session', run: () => svc.archiveNewSession() }],
    [1, { name: 'gm bank', run: () => edit((c) => (c.hack.wordBank = pick(BANKS))) }],
    [1, { name: 'gm hack mode', run: () => edit((c) => (c.hack.mode = pick(['race', 'solo']))) }],
    [
      1,
      {
        name: 'gm attempts cap',
        run: () => {
          edit((c) => (c.hack.maxAttempts = pick([null, 3, 6])));
          capLoweredInRound = svc.state.hack.round;
        },
      },
    ],
    [1, { name: 'gm ai style', run: () => edit((c) => (c.hack.aiStyle = pick(['scripted', 'live']))) }],
    [1, { name: 'gm pace', run: () => edit((c) => Object.assign(c.hack, pick([{ aiIntervalSeconds: 1, aiJitterSeconds: 0 }, { aiIntervalSeconds: 10, aiJitterSeconds: 5 }, { aiIntervalSeconds: 3, aiJitterSeconds: 2 }]))) }],
    [1, { name: 'gm free pass', run: () => edit((c) => (c.hack.freePass.enabled = r() < 0.5)) }],
    [
      1,
      {
        name: 'gm geo mode',
        run: () => {
          const before = svc.state.stage;
          edit((c) => (c.geo.mode = pick(['puzzle', 'reveal', 'off'])));
          if (STAGE_ORDER.indexOf(before) > STAGE_ORDER.indexOf('geo')) geoModeChangedLate = true;
        },
      },
    ],
    [1, { name: 'gm geo target', run: () => edit((c) => (c.geo.target = r() < 0.5 ? null : { lat: 34.6623, lng: -118.4235 })) }],
    [1, { name: 'gm restore', run: () => svc.restoreConfig(1 + Math.floor(r() * db.countConfigVersions())) }],
    [1, { name: 'gm scripts', run: () => svc.regenerateScripts() }],
    [1, { name: 'gm proposal', run: () => svc.applyProposal(svc.propose('fuzz', [{ path: 'gate.prompt', value: `prompt ${r()}` }]).id) }],
    [6, { name: 'time', run: () => vi.advanceTimersByTime(Math.floor(r() * 30_000)) }],
    [
      1,
      {
        name: 'restart',
        run: () => {
          svc.close();
          svc = new GameService(db);
        },
      },
    ],
  ];
  const total = ops.reduce((n, [w]) => n + w, 0);
  for (let step = 0; step < steps; step++) {
    let x = r() * total;
    const op = ops.find(([w]) => (x -= w) < 0)![1];
    log.push(`${step}: ${op.name} @${svc.state.stage}`);
    const before = { geo: svc.config.geo.mode, cap: svc.config.hack.maxAttempts, stage: svc.state.stage };
    try {
      const out = op.run();
      if (out instanceof Promise) out.catch(() => undefined);
    } catch (err) {
      if (!(err instanceof HttpError) || err.status >= 500) throw new Error(`seed ${seed} step ${step} (${op.name}) threw ${String(err)}\n${log.slice(-15).join('\n')}`);
    }
    // Any configuration change, an edit or a restore, can move the location mode or the cap under a game in progress.
    if (svc.config.geo.mode !== before.geo && STAGE_ORDER.indexOf(before.stage) > STAGE_ORDER.indexOf('geo')) geoModeChangedLate = true;
    if (svc.config.hack.maxAttempts !== before.cap) capLoweredInRound = svc.state.hack.round;
    if (capLoweredInRound !== null && svc.state.hack.round !== capLoweredInRound) capLoweredInRound = null;
    const why = violations(svc.config, svc.state).filter((v) => !(geoModeChangedLate && /location/.test(v)) && !(capLoweredInRound !== null && /over the cap/.test(v)));
    if (why.length) throw new Error(`seed ${seed} step ${step} (${op.name}): ${why.join('; ')}\n${log.slice(-15).join('\n')}`);
    const view = JSON.stringify(svc.view());
    for (const s of secretsFor(svc.config, svc.state)) if (view.includes(s)) throw new Error(`seed ${seed} step ${step} (${op.name}): the phone was sent "${s.slice(0, 40)}"\n${log.slice(-15).join('\n')}`);
    const saved = JSON.stringify(db.getJson('state'));
    if (saved !== JSON.stringify(svc.state)) throw new Error(`seed ${seed} step ${step} (${op.name}): what is saved differs from what is live\n${log.slice(-15).join('\n')}`);
    const h = svc.state.hack;
    if (svc.config.hack.mode === 'race' && svc.state.stage === 'hack' && !h.solved) {
      if (!h.secret || !svc.config.hack.wordBank.includes(h.secret)) throw new Error(`seed ${seed} step ${step} (${op.name}): race word ${h.secret} not from the bank in play\n${log.slice(-15).join('\n')}`);
      const open = !h.roundResult && !h.ai.solved && (svc.config.hack.maxAttempts === null || h.ai.guesses.length < svc.config.hack.maxAttempts);
      if (open && !h.ai.thinking && h.ai.nextAt === null) throw new Error(`seed ${seed} step ${step} (${op.name}): the race is open but the adversary is not scheduled\n${log.slice(-15).join('\n')}`);
    } else if (h.ai.nextAt !== null && !h.ai.thinking) {
      throw new Error(`seed ${seed} step ${step} (${op.name}): the adversary is scheduled outside an open race\n${log.slice(-15).join('\n')}`);
    }
    if (vi.getTimerCount() > 1) throw new Error(`seed ${seed} step ${step} (${op.name}): ${vi.getTimerCount()} timers pending, the adversary runs twice\n${log.slice(-15).join('\n')}`);
  }
  return log;
}

// FUZZ_SEEDS and FUZZ_STEPS make a longer hunt: FUZZ_SEEDS=500 FUZZ_STEPS=2000 npx vitest run src/service.fuzz.test.ts
const SEEDS = Number(process.env.FUZZ_SEEDS) || 40;
const STEPS = Number(process.env.FUZZ_STEPS) || 400;
const FIRST = Number(process.env.FUZZ_FIRST_SEED) || 1;
describe('random evenings', () => {
  it.each(Array.from({ length: SEEDS }, (_, i) => i + FIRST))(`seed %i: ${STEPS} steps keep the game sound`, (seed) => {
    expect(evening(seed, STEPS)).toHaveLength(STEPS);
  }, 120_000);
});

describe('restart at every step of a scripted evening', () => {
  it('loses nothing a phone or a GM would notice', () => {
    const steps: (() => unknown)[] = [
      () => svc.start(),
      () => svc.geoGuess(34.66, -118.41),
      () => svc.geoProceed(),
      () => svc.gateAttempt('nope'),
      () => svc.gateAttempt(svc.config.gate.code),
      () => svc.hackGuess('PLANTER'),
      () => vi.advanceTimersByTime(25_000),
      () => svc.hackGuess(svc.state.hack.secret!),
      () => svc.revealContinue(),
      () => svc.archiveSend('tell me about nina'),
      () => svc.pushHint('Look again.'),
      () => svc.releaseLayer2(true),
      () => svc.archiveSend('read the surveillance records'),
    ];
    for (const [i, step] of steps.entries()) {
      step();
      const before = JSON.parse(JSON.stringify({ state: svc.state, view: svc.view(), transcript: svc.archiveTranscript(), version: svc.config.version }));
      svc.close();
      svc = new GameService(db);
      const after = JSON.parse(JSON.stringify({ state: svc.state, view: svc.view(), transcript: svc.archiveTranscript(), version: svc.config.version }));
      // A restart forgets only what belonged to the old process: a request in flight and its timer.
      for (const s of [before.state, after.state]) {
        s.hack.ai.nextAt = null;
        s.hack.ai.thinking = false;
        s.archive.busy = false;
      }
      expect(after.state, `after step ${i}`).toEqual(before.state);
      expect(after.transcript).toEqual(before.transcript);
      expect(after.version).toBe(before.version);
      expect(after.view.rev).toBeGreaterThan(before.view.rev);
      expect({ ...after.view, rev: 0, hack: { ...after.view.hack, ai: null } }).toEqual({ ...before.view, rev: 0, hack: { ...before.view.hack, ai: null } });
    }
    expect(svc.state.stage).toBe('investigation');
    expect(svc.state.ledger.layer2).toBe(true);
  });
});
