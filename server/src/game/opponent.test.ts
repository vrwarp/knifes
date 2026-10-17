import { describe, expect, it } from 'vitest';
import { consistentWithHistory, drawWord, opponentDelayMs, solverGuess } from './opponent.js';

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
