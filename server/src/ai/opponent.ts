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
  /** Let the model think before guessing. Off by default: a quick, fallible opponent is the point. */
  thinking: boolean;
}

export function opponentLive(): boolean {
  return aiLive();
}

function describeHistory(history: OpponentHistoryRow[]): string {
  if (!history.length) return 'No guesses yet. Open with a strong first word.';
  return history.map((h, i) => `Guess ${i + 1}: ${h.guess} -> ${h.guess.split('').map((l, j) => `${l}:${h.scores[j]}`).join(' ')}`).join('\n');
}

/** Live style: one guess from the model. Throws on a bad or missing answer; the caller falls back to the solver. */
export async function aiOpponentGuess(req: OpponentRequest): Promise<{ guess: string; costUsd: number | null }> {
  const run = await runAgent({
    model: req.model,
    prompt: `The key is ${req.length} letters.\n${describeHistory(req.history)}\nGive your next guess.`,
    systemPrompt: OPPONENT_SYSTEM_PROMPT,
    outputFormat: { type: 'json_schema', schema: GUESS_SCHEMA },
    maxTurns: 2,
    effort: 'low',
    // Haiku 5.5 only accepts `disabled` at effort high or below; low is used above.
    thinking: req.thinking ? { type: 'adaptive' } : { type: 'disabled' },
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

const PLAN_SCHEMA = {
  type: 'object',
  properties: { guesses: { type: 'array', items: { type: 'string' } } },
  required: ['guesses'],
};

const PLANNER_SYSTEM_PROMPT = `You script the attempts of a fictional hostile AI that is racing a human to brute-force a key in a Wordle-style puzzle. You are told the key and how many guesses the script must take. Write the full sequence of guesses the AI will make, in order.

Make it look like a capable but human player working towards the key, not a computer:
- Open with a common starting word, then follow the feedback a real Wordle would give. Each guess is scored against the key: letters in the right place are "hit", letters in the key but elsewhere are "near", letters not in the key are "miss". Later guesses should keep hits in place, move nears, and avoid misses, with at most one or two natural slips across the whole script.
- Do not stall with obviously wasted guesses. Spend the extra guesses the way a person does: exploring different vowels and consonants early, chasing a plausible wrong branch (for example trying -IGHT words before -ORTH), narrowing letter by letter.
- Every guess is a real, common English word of exactly the key's length, uppercase, no repeats.
- The key appears exactly once, as the final guess. Never earlier.
Return only the structured output.`;

export interface PlanRequest {
  model: string;
  answer: string;
  guesses: number;
  thinking: boolean;
  timeoutMs: number;
}

/**
 * Checks a script the model wrote: right shape, real-looking words, the key last and only last.
 * Returns the cleaned plan, or null when it cannot be played as is.
 */
export function validatePlan(raw: unknown, answer: string, guesses: number): string[] | null {
  if (!Array.isArray(raw)) return null;
  const plan = raw.map((g) => String(g ?? '').toUpperCase().replace(/[^A-Z]/g, ''));
  if (plan.length < 2 || Math.abs(plan.length - guesses) > 1) return null;
  if (plan.some((g) => g.length !== answer.length)) return null;
  if (new Set(plan).size !== plan.length) return null;
  if (plan[plan.length - 1] !== answer || plan.slice(0, -1).includes(answer)) return null;
  return plan;
}

/** One model call that writes the whole round. Throws when the answer is unusable; the caller falls back to a generated script. */
export async function aiOpponentPlan(req: PlanRequest): Promise<{ plan: string[]; costUsd: number | null }> {
  const run = await runAgent({
    model: req.model,
    prompt: `Key: ${req.answer}. Length: ${req.answer.length} letters. Script exactly ${req.guesses} guesses, the last one being ${req.answer}.`,
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    outputFormat: { type: 'json_schema', schema: PLAN_SCHEMA },
    maxTurns: 2,
    persist: false,
    timeoutMs: req.timeoutMs,
    thinking: req.thinking ? { type: 'adaptive' } : { type: 'disabled' },
  });
  const plan = validatePlan((run.structured as { guesses?: unknown } | undefined)?.guesses, req.answer, req.guesses);
  if (!plan) throw new Error(`planner returned an unusable script: ${JSON.stringify(run.structured ?? run.text).slice(0, 160)}`);
  return { plan, costUsd: run.costUsd };
}
