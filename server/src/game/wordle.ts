import type { LetterScore } from '../types.js';

export function normalizeGuess(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '');
}

export function scoreGuess(guess: string, secret: string): LetterScore[] {
  const g = guess.toUpperCase();
  const s = secret.toUpperCase();
  const result: LetterScore[] = g.split('').map((letter) => ({ letter, state: 'miss' }));
  const remaining = new Map<string, number>();
  for (let i = 0; i < s.length; i++) {
    if (g[i] === s[i]) {
      result[i].state = 'hit';
    } else {
      remaining.set(s[i], (remaining.get(s[i]) ?? 0) + 1);
    }
  }
  for (let i = 0; i < g.length; i++) {
    if (result[i].state === 'hit') continue;
    const left = remaining.get(g[i]) ?? 0;
    if (left > 0) {
      result[i].state = 'near';
      remaining.set(g[i], left - 1);
    }
  }
  return result;
}

/** Every letter placed, and as many letters as the key: a prefix of the key is all hits too, but not the key. */
export function isSolved(scores: LetterScore[], length = scores.length): boolean {
  return scores.length > 0 && scores.length === length && scores.every((s) => s.state === 'hit');
}
