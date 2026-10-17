import type { LetterState } from '../types.js';
import { scoreGuess } from './wordle.js';

export interface OpponentHistoryRow {
  guess: string;
  scores: LetterState[];
}

/** True when `candidate` would have produced exactly this feedback for every earlier guess. */
export function consistentWithHistory(candidate: string, history: OpponentHistoryRow[]): boolean {
  return history.every((row) => {
    const s = scoreGuess(row.guess, candidate);
    return s.length === row.scores.length && s.every((x, i) => x.state === row.scores[i]);
  });
}

/**
 * Deterministic opponent used in mock mode and as the fallback when the model answers badly:
 * the first bank word of the right length that fits every clue and has not been tried yet.
 * Falls back to any untried bank word so a round never stalls on an inconsistent history.
 */
export function solverGuess(bank: string[], length: number, history: OpponentHistoryRow[]): string | null {
  const tried = new Set(history.map((h) => h.guess));
  const words = bank.map((w) => w.toUpperCase()).filter((w) => w.length === length && !tried.has(w));
  return words.find((w) => consistentWithHistory(w, history)) ?? words[0] ?? null;
}

/** Picks a word for a new round, avoiding `used`; once the bank is exhausted every word is fair again. */
export function drawWord(bank: string[], used: string[], random: () => number = Math.random): string | null {
  const all = bank.map((w) => w.toUpperCase());
  if (!all.length) return null;
  const seen = new Set(used.map((w) => w.toUpperCase()));
  const fresh = all.filter((w) => !seen.has(w));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(random() * pool.length)] ?? null;
}

/** The pace for round `rounds + 1`: base interval and jitter scaled by the slowdown factor once per finished round, interval capped at 10 minutes. */
export function opponentPace(base: { aiIntervalSeconds: number; aiJitterSeconds: number; aiSlowdownPerRound: number }, rounds: number): { intervalSeconds: number; jitterSeconds: number } {
  const factor = Math.pow(Math.max(1, base.aiSlowdownPerRound), Math.max(0, rounds));
  const intervalSeconds = Math.min(600, base.aiIntervalSeconds * factor);
  const jitterSeconds = Math.min(intervalSeconds, base.aiJitterSeconds * factor);
  return { intervalSeconds, jitterSeconds };
}

/** Interval ± jitter, in milliseconds, never below half a second. */
export function opponentDelayMs(intervalSeconds: number, jitterSeconds: number, random: () => number = Math.random): number {
  const jitter = Math.min(jitterSeconds, intervalSeconds) * (random() * 2 - 1);
  return Math.max(500, Math.round((intervalSeconds + jitter) * 1000));
}
