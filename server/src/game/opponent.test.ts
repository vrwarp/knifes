import { describe, expect, it } from 'vitest';
import { consistentWithHistory, drawWord, generatedPlan, opponentDelayMs, opponentPace, planLength, solverGuess } from './opponent.js';
import { scoreGuess } from './wordle.js';

const BANK = ['CRANE', 'SLATE', 'ALPHA', 'PLANT', 'BRICK'];

describe('solverGuess', () => {
  it('starts with the first bank word', () => {
    expect(solverGuess(BANK, 5, [])).toBe('CRANE');
  });
  it('only keeps words that fit every clue', () => {
    // CRANE against ALPHA: C miss, R miss, A near, N miss, E miss.
    const history = [{ guess: 'CRANE', scores: ['miss', 'miss', 'near', 'miss', 'miss'] as const }];
    expect(consistentWithHistory('ALPHA', [...history])).toBe(true);
    expect(consistentWithHistory('SLATE', [...history])).toBe(false);
    expect(solverGuess(BANK, 5, [...history])).toBe('ALPHA');
  });
  it('never repeats a guess and never stalls', () => {
    const history = [
      { guess: 'CRANE', scores: ['hit', 'hit', 'hit', 'hit', 'hit'] as const },
      { guess: 'SLATE', scores: ['miss', 'miss', 'miss', 'miss', 'miss'] as const },
    ];
    const g = solverGuess(BANK, 5, [...history]);
    expect(g).not.toBeNull();
    expect(['CRANE', 'SLATE']).not.toContain(g);
  });
  it('returns null when the bank has no word of that length', () => {
    expect(solverGuess(BANK, 6, [])).toBeNull();
  });
});

describe('drawWord', () => {
  it('avoids used words until the bank is spent', () => {
    expect(drawWord(BANK, ['CRANE', 'SLATE', 'ALPHA', 'PLANT'], () => 0.99)).toBe('BRICK');
    expect(BANK).toContain(drawWord(BANK, BANK, () => 0.5));
  });
  it('is null for an empty bank', () => {
    expect(drawWord([], [])).toBeNull();
  });
});

describe('opponentDelayMs', () => {
  it('stays within interval ± jitter', () => {
    expect(opponentDelayMs(5, 1, () => 0)).toBe(4000);
    expect(opponentDelayMs(5, 1, () => 1)).toBe(6000);
    expect(opponentDelayMs(5, 1, () => 0.5)).toBe(5000);
  });
  it('never drops below half a second', () => {
    expect(opponentDelayMs(0.1, 5, () => 0)).toBe(500);
  });
});

describe('opponentPace', () => {
  const base = { aiIntervalSeconds: 10, aiJitterSeconds: 5, aiSlowdownPerRound: 1.5 };
  it('slows by the factor after every lost round', () => {
    expect(opponentPace(base, 0)).toEqual({ intervalSeconds: 10, jitterSeconds: 5 });
    expect(opponentPace(base, 1)).toEqual({ intervalSeconds: 15, jitterSeconds: 7.5 });
    expect(opponentPace(base, 2)).toEqual({ intervalSeconds: 22.5, jitterSeconds: 11.25 });
  });
  it('stays constant at factor 1 and never speeds up below it', () => {
    expect(opponentPace({ ...base, aiSlowdownPerRound: 1 }, 5)).toEqual({ intervalSeconds: 10, jitterSeconds: 5 });
    expect(opponentPace({ ...base, aiSlowdownPerRound: 0.5 }, 5)).toEqual({ intervalSeconds: 10, jitterSeconds: 5 });
  });
  it('caps the interval at ten minutes', () => {
    expect(opponentPace(base, 20).intervalSeconds).toBe(600);
  });
});

describe('generatedPlan', () => {
  const big = ['CRANE', 'SLATE', 'PLANT', 'BRICK', 'STORM', 'QUEST', 'ZEBRA', 'MOUND', 'SHORE', 'SHIRT', 'SHORT', 'STORE', 'SPORE', 'SNORE', 'SWORE', 'SHARE'];
  it('has the asked length, ends on the answer, never repeats or reveals early', () => {
    for (const n of [2, 5, 8, 12]) {
      const p = generatedPlan(big, 'SHORE', n, () => 0.37);
      expect(p.length).toBe(Math.min(n, big.length));
      expect(p[p.length - 1]).toBe('SHORE');
      expect(p.slice(0, -1)).not.toContain('SHORE');
      expect(new Set(p).size).toBe(p.length);
    }
  });
  it('prefers words that fit the clues so far', () => {
    const p = generatedPlan(big, 'SHORE', 4, () => 0);
    // Every word after the first still fits what the previous ones revealed, while such words exist.
    const rows: { guess: string; scores: ('hit' | 'near' | 'miss')[] }[] = [];
    for (const g of p.slice(0, -1)) {
      const consistent = big.filter((w) => w !== 'SHORE' && !p.slice(0, p.indexOf(g)).includes(w) && consistentWithHistory(w, rows));
      if (consistent.length) expect(consistent).toContain(g);
      rows.push({ guess: g, scores: scoreGuess(g, 'SHORE').map((x) => x.state) });
    }
  });
});

describe('planLength', () => {
  it('stays within guesses ± jitter and at least two', () => {
    expect(planLength(8, 2, () => 0)).toBe(6);
    expect(planLength(8, 2, () => 1)).toBe(10);
    expect(planLength(1, 3, () => 0)).toBe(2);
  });
});
