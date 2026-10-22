import { describe, expect, it } from 'vitest';
import { secretsFor, violations } from '../../test/invariants.js';
import { DEFAULT_CONFIG } from '../defaultConfig.js';
import { STAGE_ORDER, type GameConfig, type GameState, type GeoMode, type HackMode, type StageId } from '../types.js';
import { advanceTo, currentSecret, forceStage, freshRound, initialHack, initialState, nextStage, normalizeHack, playerView, resetStage, stageIndex, streetViewForPlayer } from './state.js';

// Every GM jump and every reset, from every stage, leaves a state the phone can play from.

const cfg = (geo: GeoMode = 'puzzle', hack: HackMode = 'race'): GameConfig => {
  const c = structuredClone(DEFAULT_CONFIG);
  c.geo.mode = geo;
  c.hack.mode = hack;
  return c;
};
/** A state at `stage` the way the GM console gets there. */
const at = (c: GameConfig, stage: StageId): GameState => {
  const s = initialState();
  if (stage !== 'intro') forceStage(c, s, stage, 1000);
  return s;
};

describe('GM jumps', () => {
  for (const geo of ['puzzle', 'reveal', 'off'] as GeoMode[]) {
    it(`from every stage to every stage keeps the state sound (geo ${geo})`, () => {
      const c = cfg(geo);
      for (const from of STAGE_ORDER) {
        for (const to of STAGE_ORDER) {
          const s = at(c, from);
          s.hack.guesses = ['GUESSES'];
          s.hack.guessAt = [5];
          forceStage(c, s, to, 2000);
          expect(s.stage).toBe(to);
          expect(s.stageTimes[to]).toBe(2000);
          expect(violations(c, s), `${from} -> ${to}`).toEqual([]);
          if (to === 'investigation') expect(s.ledger.layer1).toBe(true);
          expect(s.ledger.layer2, 'a jump never releases the surveillance records').toBe(false);
          // Rewinding to the key race starts a fresh round; jumping forward past it marks it solved.
          if (stageIndex(to) <= stageIndex('hack') && stageIndex(from) >= stageIndex('reveal')) expect(s.hack.guesses).toEqual([]);
        }
      }
    });
  }
});

describe('stage resets', () => {
  it('from every stage, for every scope, rewind at most to the scope and keep the state sound', () => {
    const c = cfg();
    for (const from of STAGE_ORDER) {
      for (const scope of STAGE_ORDER) {
        const s = at(c, from);
        s.geo.attempts = 3;
        s.gate.attempts = 2;
        resetStage(c, s, scope);
        const expected = stageIndex(from) > stageIndex(scope) ? scope : from;
        expect(s.stage, `${from} reset ${scope}`).toBe(expected);
        if (scope === 'geo') expect(s.geo).toEqual({ attempts: 0, solved: false, lastDistanceM: null });
        if (scope === 'gate') expect(s.gate).toEqual({ attempts: 0, passed: false });
        if (scope === 'hack') expect(s.hack).toEqual(initialHack());
        if (scope === 'investigation') expect(s.ledger).toEqual({ layer1: true, layer2: false, layer2ReleasedAt: null });
        // Resetting a stage he has not reached changes nothing about where he is.
        if (stageIndex(from) <= stageIndex(scope)) expect(s.stage).toBe(from);
        const v = violations(c, s).filter((x) => !(scope === 'investigation' && /ledger/.test(x)));
        expect(v, `${from} reset ${scope}`).toEqual([]);
      }
    }
  });
});

describe('stage order', () => {
  it('skips the location only when it is off, and ends at the investigation', () => {
    for (const geo of ['puzzle', 'reveal', 'off'] as GeoMode[]) {
      const c = cfg(geo);
      expect(nextStage(c, 'intro')).toBe(geo === 'off' ? 'gate' : 'geo');
      expect(nextStage(c, 'geo')).toBe('gate');
      expect(nextStage(c, 'gate')).toBe('hack');
      expect(nextStage(c, 'hack')).toBe('reveal');
      expect(nextStage(c, 'reveal')).toBe('investigation');
      expect(nextStage(c, 'investigation')).toBeNull();
      expect(nextStage(c, 'nowhere' as StageId)).toBeNull();
    }
  });
  it('only ever advances, and records the first start once', () => {
    const s = initialState();
    for (const [i, st] of STAGE_ORDER.entries()) {
      if (st === 'intro') continue;
      expect(advanceTo(s, st, 1000 + i)).toBe(true);
      for (const back of STAGE_ORDER.slice(0, i + 1)) expect(advanceTo(s, back, 9999)).toBe(false);
    }
    expect(s.startedAt).toBe(1001);
    expect(s.stage).toBe('investigation');
  });
});

describe('the word in play', () => {
  it('is the drawn word in a race, the configured one otherwise, always upper case', () => {
    const c = cfg('puzzle', 'race');
    c.hack.secret = 'lantern';
    const s = initialState();
    expect(currentSecret(c, s)).toBe('LANTERN');
    s.hack.secret = 'phantom';
    expect(currentSecret(c, s)).toBe('PHANTOM');
    c.hack.mode = 'solo';
    expect(currentSecret(c, s)).toBe('LANTERN');
  });
  it('a fresh round keeps the race history and clears the boards', () => {
    const h = { ...initialHack(), used: ['A'], rounds: 2, round: 3, lastWord: 'A', lastRound: { result: 'ai' as const, word: 'A', round: 3, aiAttempts: 4, playerAttempts: 1 }, guesses: ['X'], guessAt: [1], secret: 'B', solved: true };
    const f = freshRound(h);
    expect(f).toMatchObject({ used: ['A'], rounds: 2, round: 3, lastWord: 'A', guesses: [], guessAt: [], secret: null, solved: false });
    expect(f.lastRound).toEqual(h.lastRound);
    expect(f.used).toBe(h.used);
  });
  it('an older save without the race fields gets them, with timestamps that keep the transcript in order', () => {
    const h = normalizeHack({ guesses: ['AB', 'CD'], solved: false, lockedUntil: null, rounds: 1, ai: { guesses: ['EF'] } } as never);
    expect(h.guessAt).toEqual([0, 1]);
    expect(h.ai.guessAt).toEqual([0]);
    expect(h.ai.thinking).toBe(false);
    expect(h.used).toEqual([]);
    expect(normalizeHack(undefined)).toEqual(initialHack());
  });
});

describe('what the phone may see, for every stage and mode', () => {
  const states = (c: GameConfig, stage: StageId): GameState[] => {
    const s = at(c, stage);
    const out = [s];
    if (c.hack.mode === 'race') {
      const r = at(c, stage);
      r.hack.secret = 'PHANTOM';
      r.hack.used = ['STEALTH', 'PHANTOM'];
      r.hack.round = 2;
      r.hack.rounds = 1;
      r.hack.lastRound = { result: 'ai', word: 'STEALTH', round: 1, aiAttempts: 6, playerAttempts: 2 };
      r.hack.guesses = ['ABCDEFG'];
      r.hack.guessAt = [1];
      r.hack.ai.guesses = ['QWERTYU', 'PLAYERS'];
      r.hack.ai.guessAt = [1, 2];
      out.push(r);
    }
    if (stage === 'investigation') {
      const l = at(c, stage);
      l.ledger.layer2 = true;
      l.ledger.layer2ReleasedAt = 5;
      out.push(l);
    }
    return out;
  };
  for (const geo of ['puzzle', 'reveal', 'off'] as GeoMode[]) {
    for (const hack of ['race', 'solo'] as HackMode[]) {
      for (const showLetters of [true, false]) {
        it(`holds no answer at any stage (geo ${geo}, ${hack}, adversary letters ${showLetters ? 'on' : 'off'})`, () => {
          const c = cfg(geo, hack);
          c.hack.aiShowLetters = showLetters;
          c.geo.target = { lat: 34.6623, lng: -118.4235 };
          for (const stage of STAGE_ORDER) {
            for (const s of states(c, stage)) {
              const json = JSON.stringify(playerView(c, s));
              for (const secret of secretsFor(c, s)) expect(json.includes(secret), `${stage}: ${secret.slice(0, 50)}`).toBe(false);
              expect(json).not.toContain('"hackScripts"');
              expect(json).not.toContain('"sessionId"');
              expect(json).not.toContain('"wordBank"');
              expect(json).not.toContain('"plan"');
              if (!showLetters) for (const row of playerView(c, s).hack.ai?.rows ?? []) expect(row.every((x) => x.letter === '')).toBe(true);
            }
          }
        });
      }
    }
  }
  it('the drop point goes out only once it is found, or when there is no puzzle to give away', () => {
    const c = cfg('puzzle');
    c.geo.target = { lat: 1.5, lng: 2.5 };
    const s = at(c, 'geo');
    expect(playerView(c, s).geo.target).toBeNull();
    expect(playerView(c, s).geo.targetSet).toBe(true);
    s.geo.solved = true;
    expect(playerView(c, s).geo.target).toEqual({ lat: 1.5, lng: 2.5 });
    for (const mode of ['reveal', 'off'] as GeoMode[]) {
      c.geo.mode = mode;
      s.geo.solved = false;
      expect(playerView(c, s).geo.target).toEqual({ lat: 1.5, lng: 2.5 });
    }
  });
  it('the Street View panorama is sent only while the puzzle is live, and never after it is solved', () => {
    const c = cfg('puzzle');
    c.geo.target = { lat: 1, lng: 2 };
    for (const stage of STAGE_ORDER) {
      const s = at(c, stage);
      const sv = streetViewForPlayer(c, s, 'key');
      if (stage === 'geo') expect(sv).not.toBeNull();
      else expect(sv, stage).toBeNull();
      s.geo.solved = true;
      expect(streetViewForPlayer(c, s, 'key')).toBeNull();
    }
  });
  it('the word of a lost round shows once it is retired, never the word in play', () => {
    const c = cfg('puzzle', 'race');
    const s = at(c, 'hack');
    s.hack.secret = 'PHANTOM';
    s.hack.roundResult = 'ai';
    s.hack.lastWord = 'STEALTH';
    expect(playerView(c, s).hack.lastWord).toBe('STEALTH');
    s.hack.roundResult = 'player';
    expect(playerView(c, s).hack.lastWord).toBeNull();
    expect(JSON.stringify(playerView(c, s))).not.toContain('PHANTOM');
  });
  it('counts the keys left by the bank in play', () => {
    const c = cfg('puzzle', 'race');
    const s = at(c, 'hack');
    s.hack.used = ['STEALTH', 'NOTINBANK', 'PHANTOM'];
    expect(playerView(c, s).hack.wordsLeft).toBe(c.hack.wordBank.length - 2);
    c.hack.mode = 'solo';
    expect(playerView(c, s).hack.wordsLeft).toBeNull();
  });
});
