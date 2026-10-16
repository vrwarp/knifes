import { describe, expect, it } from 'vitest';
import { isSolved, normalizeGuess, scoreGuess } from './wordle.js';

describe('scoreGuess', () => {
  it('marks a perfect guess as all hits', () => {
    const r = scoreGuess('ALPHA', 'ALPHA');
    expect(r.map((x) => x.state)).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
    expect(isSolved(r)).toBe(true);
  });
  it('handles duplicate letters like Wordle', () => {
    const r = scoreGuess('APPLE', 'ALPHA');
    expect(r.map((x) => x.state)).toEqual(['hit', 'miss', 'hit', 'near', 'miss']);
    expect(isSolved(r)).toBe(false);
  });
  it('marks misplaced letters as near', () => {
    const r = scoreGuess('HAPLA', 'ALPHA');
    expect(r.map((x) => x.state)).toEqual(['near', 'near', 'hit', 'near', 'hit']);
  });
  it('normalizes input', () => {
    expect(normalizeGuess(' al-pha ')).toBe('ALPHA');
  });
});
