import type { OpponentHistoryRow } from '../game/opponent.js';
import { aiLive, runAgent } from './agent.js';

const GUESS_SCHEMA = {
  type: 'object',
  properties: { guess: { type: 'string' } },
  required: ['guess'],
};

const OPPONENT_SYSTEM_PROMPT = `You are a hostile process racing a human to brute-force a key in a Wordle-style puzzle. Each turn you submit one guess: a real English word of exactly the required length, uppercase letters only, never one you have already tried.

After each guess you learn, letter by letter: "hit" means that letter is correct and in that position, "near" means the letter is in the key but somewhere else, "miss" means the letter is not in the key (or appears fewer times than you used it). Use every clue: keep hits in place, move nears, drop misses. Do not explain. Return only the structured output with your next guess.`;

export interface OpponentRequest {
  model: string;
  length: number;
  history: OpponentHistoryRow[];
  timeoutMs: number;
}

export function opponentLive(): boolean {
  return aiLive();
}

function describeHistory(history: OpponentHistoryRow[]): string {
  if (!history.length) return 'No guesses yet. Open with a strong first word.';
  return history.map((h, i) => `Guess ${i + 1}: ${h.guess} -> ${h.guess.split('').map((l, j) => `${l}:${h.scores[j]}`).join(' ')}`).join('\n');
}

/** One guess from the model. Throws on a bad or missing answer; the caller falls back to the solver. */
export async function aiOpponentGuess(req: OpponentRequest): Promise<{ guess: string; costUsd: number | null }> {
  const run = await runAgent({
    model: req.model,
    prompt: `The key is ${req.length} letters.\n${describeHistory(req.history)}\nGive your next guess.`,
    systemPrompt: OPPONENT_SYSTEM_PROMPT,
    outputFormat: { type: 'json_schema', schema: GUESS_SCHEMA },
    maxTurns: 2,
    effort: 'low',
    persist: false,
    timeoutMs: req.timeoutMs,
  });
  const raw = (run.structured as { guess?: unknown } | undefined)?.guess ?? run.text;
  const guess = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (guess.length !== req.length) throw new Error(`opponent answered "${String(raw ?? '').slice(0, 40)}", not ${req.length} letters`);
  if (req.history.some((h) => h.guess === guess)) throw new Error(`opponent repeated ${guess}`);
  return { guess, costUsd: run.costUsd };
}
