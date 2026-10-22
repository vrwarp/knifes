import { describe, expect, it } from 'vitest';
import { DEFAULT_WORD_BANK, vocabularyFor } from '../content/words.js';
import type { LetterState } from '../types.js';
import { formatDistance, haversineMeters } from './geo.js';
import { consistentWithHistory, drawWord, generatedPlan, opponentDelayMs, opponentPace, planLength, solverGuess, type OpponentHistoryRow } from './opponent.js';
import { isSolved, normalizeGuess, scoreGuess } from './wordle.js';

/** A seeded generator, so a failure here can be replayed. */
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
const randomWord = (r: () => number, len: number, alphabet: string) => Array.from({ length: len }, () => alphabet[Math.floor(r() * alphabet.length)]).join('');
const count = (w: string, l: string) => w.split('').filter((x) => x === l).length;

describe('word scoring, against the rules that define it', () => {
  it('holds for 20,000 random pairs heavy in repeated letters', () => {
    const r = rng(30);
    for (let n = 0; n < 20_000; n++) {
      const len = 3 + Math.floor(r() * 6);
      const alphabet = n % 2 ? 'ABCD' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const secret = randomWord(r, len, alphabet);
      const guess = randomWord(r, len, alphabet);
      const s = scoreGuess(guess, secret).map((x) => x.state);
      // 1. A letter is placed exactly where it matches.
      for (let i = 0; i < len; i++) expect(s[i] === 'hit', `${guess}/${secret}@${i}`).toBe(guess[i] === secret[i]);
      // 2. Each letter is coloured as often as it can be matched, no more.
      for (const l of new Set(guess)) {
        const coloured = s.filter((x, i) => guess[i] === l && x !== 'miss').length;
        expect(coloured, `${guess}/${secret} letter ${l}`).toBe(Math.min(count(guess, l), count(secret, l)));
      }
      // 3. Misplaced marks go to the leftmost unplaced copies.
      for (const l of new Set(guess)) {
        const unplaced = [...guess].map((x, i) => i).filter((i) => guess[i] === l && s[i] !== 'hit');
        const near = unplaced.filter((i) => s[i] === 'near');
        expect(near, `${guess}/${secret} letter ${l}`).toEqual(unplaced.slice(0, near.length));
      }
      expect(isSolved(scoreGuess(guess, secret))).toBe(guess === secret);
    }
  });
  it('ignores case and keeps the letters it was given', () => {
    expect(scoreGuess('stealth', 'STEALTH').every((x) => x.state === 'hit')).toBe(true);
    expect(scoreGuess('Phantom', 'phantom').map((x) => x.letter).join('')).toBe('PHANTOM');
  });
  it('never throws on lengths that do not match, and never calls those solved', () => {
    expect(isSolved(scoreGuess('ABC', 'ABCD'), 4), 'a prefix of the key is not the key').toBe(false);
    expect(isSolved(scoreGuess('ABCDE', 'ABCD'), 4)).toBe(false);
    expect(isSolved(scoreGuess('', 'ABCD'), 4)).toBe(false);
    expect(isSolved(scoreGuess('ABCD', 'ABCD'), 4)).toBe(true);
    expect(isSolved([])).toBe(false);
  });
  it('normalises what a phone keyboard or a paste can produce', () => {
    expect(normalizeGuess(' st-ea lth\n')).toBe('STEALTH');
    expect(normalizeGuess('ΣTEALTH')).toBe('TEALTH');
    expect(normalizeGuess('ste4lth')).toBe('STELTH');
    expect(normalizeGuess('')).toBe('');
  });
});

describe('the deterministic adversary', () => {
  const simulate = (bank: string[], secret: string) => {
    const vocab = vocabularyFor(bank, secret.length);
    const history: OpponentHistoryRow[] = [];
    for (let i = 0; i < vocab.length; i++) {
      const g = solverGuess(vocab, secret.length, history);
      expect(g, `stalled on ${secret}`).not.toBeNull();
      expect(history.some((h) => h.guess === g), `repeated ${g}`).toBe(false);
      history.push({ guess: g!, scores: scoreGuess(g!, secret).map((x) => x.state) });
      if (g === secret) return history.length;
    }
    throw new Error(`never solved ${secret}`);
  };
  it('solves every default key, never repeating, in a handful of guesses', () => {
    const steps = DEFAULT_WORD_BANK.map((w) => simulate(DEFAULT_WORD_BANK, w));
    expect(Math.max(...steps)).toBeLessThanOrEqual(12);
  });
  it('solves five-letter banks too', () => {
    const bank = ['CRANE', 'SLATE', 'PLANT', 'BRICK', 'STORM', 'QUEST'];
    for (const w of bank) expect(simulate(bank, w)).toBeLessThanOrEqual(12);
  });
  it('keeps the key consistent with its own feedback, always', () => {
    const r = rng(7);
    for (let n = 0; n < 500; n++) {
      const secret = randomWord(r, 7, 'AEIOURSTLN');
      const rows = Array.from({ length: 4 }, () => randomWord(r, 7, 'AEIOURSTLN')).map((g) => ({ guess: g, scores: scoreGuess(g, secret).map((x) => x.state) }));
      expect(consistentWithHistory(secret, rows)).toBe(true);
    }
  });
  it('rejects a candidate whose length differs from the history', () => {
    expect(consistentWithHistory('ABC', [{ guess: 'ABCD', scores: ['hit', 'hit', 'hit', 'hit'] as LetterState[] }])).toBe(false);
  });
});

describe('generated scripts for every key and length', () => {
  it('end on the key and only there, never repeat, and keep to the key length', () => {
    for (const word of DEFAULT_WORD_BANK) {
      const vocab = vocabularyFor(DEFAULT_WORD_BANK, word.length);
      for (let n = 1; n <= 30; n++) {
        for (const seed of [1, 2, 3]) {
          const plan = generatedPlan(vocab, word, n, rng(seed * 100 + n));
          expect(plan.at(-1)).toBe(word);
          expect(plan.slice(0, -1)).not.toContain(word);
          expect(new Set(plan).size).toBe(plan.length);
          expect(plan.every((g) => g.length === word.length && /^[A-Z]+$/.test(g))).toBe(true);
          expect(plan.length).toBe(Math.max(1, n));
        }
      }
    }
  });
  it('still ends on the key when the bank has nothing else to offer', () => {
    expect(generatedPlan(['ABCDEF'], 'ABCDEF', 8)).toEqual(['ABCDEF']);
    expect(generatedPlan(['ABCDEF', 'ABCDEG'], 'abcdef', 8)).toEqual(['ABCDEG', 'ABCDEF']);
    expect(generatedPlan([], 'QUIZ', 4)).toEqual(['QUIZ']);
  });
  it('script lengths stay within guesses ± jitter, and at least two', () => {
    const r = rng(11);
    for (let i = 0; i < 2000; i++) {
      const g = 2 + Math.floor(r() * 29);
      const j = Math.floor(r() * g);
      const n = planLength(g, j, r);
      expect(n).toBeGreaterThanOrEqual(Math.max(2, g - j));
      expect(n).toBeLessThanOrEqual(g + j);
    }
  });
});

describe('drawing keys', () => {
  it('a full game draws every key once before any repeats, whatever the case of the bank', () => {
    const r = rng(3);
    const bank = DEFAULT_WORD_BANK.map((w, i) => (i % 2 ? w.toLowerCase() : w));
    const used: string[] = [];
    for (let i = 0; i < bank.length; i++) used.push(drawWord(bank, used, r)!);
    expect(new Set(used).size).toBe(bank.length);
    expect(used.every((w) => w === w.toUpperCase())).toBe(true);
    expect(DEFAULT_WORD_BANK).toContain(drawWord(bank, used, r));
  });
  it('treats used words case-insensitively', () => {
    expect(drawWord(['ALPHA', 'BRAVO'], ['alpha'], () => 0)).toBe('BRAVO');
  });
});

describe('opponent pace', () => {
  const base = { aiIntervalSeconds: 10, aiJitterSeconds: 5, aiSlowdownPerRound: 1.5 };
  it('never speeds up from one round to the next, keeps jitter under the interval, and stops at ten minutes', () => {
    let last = 0;
    for (let rounds = 0; rounds < 40; rounds++) {
      const p = opponentPace(base, rounds);
      expect(p.intervalSeconds).toBeGreaterThanOrEqual(last);
      expect(p.jitterSeconds).toBeLessThanOrEqual(p.intervalSeconds);
      expect(p.intervalSeconds).toBeLessThanOrEqual(600);
      last = p.intervalSeconds;
    }
  });
  it('treats a negative round count as the first round', () => {
    expect(opponentPace(base, -3)).toEqual(opponentPace(base, 0));
  });
  it('waits interval ± jitter, never under half a second', () => {
    const r = rng(5);
    for (let i = 0; i < 5000; i++) {
      const interval = 0.2 + r() * 50;
      const jitter = r() * 60;
      const ms = opponentDelayMs(interval, jitter, r);
      const j = Math.min(jitter, interval);
      expect(ms).toBeGreaterThanOrEqual(500);
      expect(ms).toBeLessThanOrEqual(Math.max(500, Math.round((interval + j) * 1000)));
      if ((interval - j) * 1000 >= 500) expect(ms).toBeGreaterThanOrEqual(Math.round((interval - j) * 1000));
    }
  });
  it('the default pace gives the expected adversary round times', () => {
    // 8 guesses at 10 s, 15 s, 22.5 s... per round: the GMs' feel for how long Jimmy has.
    const rounds = [0, 1, 2, 3].map((r) => 8 * opponentPace(base, r).intervalSeconds);
    expect(rounds).toEqual([80, 120, 180, 270]);
  });
});

describe('distances', () => {
  it('is symmetric and obeys the triangle inequality', () => {
    const r = rng(9);
    const p = () => ({ lat: -89 + r() * 178, lng: -179 + r() * 358 });
    for (let i = 0; i < 2000; i++) {
      const a = p();
      const b = p();
      const c = p();
      expect(Math.abs(haversineMeters(a, b) - haversineMeters(b, a))).toBeLessThan(1e-6);
      expect(haversineMeters(a, c)).toBeLessThanOrEqual(haversineMeters(a, b) + haversineMeters(b, c) + 1e-6);
      expect(haversineMeters(a, b)).toBeLessThanOrEqual(20_015_100);
    }
  });
  it('handles the antimeridian and the poles', () => {
    expect(haversineMeters({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeLessThan(23_000);
    expect(haversineMeters({ lat: 90, lng: 0 }, { lat: 90, lng: 120 })).toBeLessThan(1);
    expect(haversineMeters({ lat: 90, lng: 0 }, { lat: -90, lng: 0 })).toBeCloseTo(Math.PI * 6_371_000, -2);
  });
  it('a pin 150 m from the drop near Lake Elizabeth is inside a 200 m radius, 250 m is not', () => {
    const drop = { lat: 34.6623, lng: -118.4235 };
    const north = (m: number) => ({ lat: drop.lat + m / 111_195, lng: drop.lng });
    expect(haversineMeters(drop, north(150))).toBeLessThan(200);
    expect(haversineMeters(drop, north(250))).toBeGreaterThan(200);
  });
  it('formats every range readably', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(999.4)).toBe('999 m');
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(9_949)).toBe('9.9 km');
    expect(formatDistance(10_000)).toBe('10 km');
    expect(formatDistance(12_345_678)).toBe('12346 km');
  });
});
