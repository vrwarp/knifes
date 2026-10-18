import { currentSecret } from '../game/state.js';
import type { GameConfig, GameEvent, GameState } from '../types.js';
import { aiLive, runAgent } from './agent.js';

export type HintStrength = 'nudge' | 'clear' | 'strong';

const HINT_SCHEMA = {
  type: 'object',
  properties: { hint: { type: 'string' }, rationale: { type: 'string' } },
  required: ['hint', 'rationale'],
};

const COPILOT_SYSTEM_PROMPT = `You assist the game masters of a live murder-mystery party. The detective (the player, Jimmy) is working through a phone web app. You draft a single hint that a game master will review and push to the player's screen as an in-world "incoming transmission" from Section 30.

Write one to three sentences. In-world voice: terse intelligence-briefing tone, no emoji, no meta commentary, never mention a game, hints, or game masters. Strength "nudge": point at where to look without naming the answer. Strength "clear": narrow it to one or two possibilities. Strength "strong": state the answer plainly but in character. Return the hint and a one-line rationale for the game master.`;

/** The canonical deduction, read from the configured slots so GM edits carry through. */
export function solutionLine(config: GameConfig): string {
  const c = (id: string) => config.deduction.slots.find((s) => s.id === id)?.canonical ?? '?';
  return `at ${c('time')} ${c('suspect')} killed the Director with ${c('method')} to take ${c('asset')} ${c('motive')}; the hard copy of the Ledger is hidden in ${c('prop')}`;
}

function describeStage(config: GameConfig, state: GameState): string {
  const lines: string[] = [`Current stage: ${state.stage}`];
  switch (state.stage) {
    case 'geo':
      lines.push(`Geo puzzle attempts: ${state.geo.attempts}, last distance ${state.geo.lastDistanceM ?? 'n/a'} m, target radius ${config.geo.radiusMeters} m. Reveal text they will see: ${config.geo.revealBody}`);
      break;
    case 'gate':
      lines.push(`Code gate attempts: ${state.gate.attempts}. The correct code (never reveal verbatim unless strength is strong): ${config.gate.code}. The code comes from a phone call to Phil, his old code breaker, after he gives the challenge phrase.`);
      break;
    case 'hack':
      lines.push(`Word puzzle: secret is ${currentSecret(config, state)}; guesses so far: ${state.hack.guesses.join(', ') || 'none'}; lockouts: ${state.hack.rounds}.`);
      if (config.hack.mode === 'race') lines.push(`He is racing an AI opponent for the same word; the opponent has guessed ${state.hack.ai.guesses.join(', ') || 'nothing yet'}.`);
      break;
    case 'investigation':
      lines.push(
        `Investigation phase. Solution: ${solutionLine(config)}. Ledger Layer 02 (${config.ledger.layer2Label}) is ${state.ledger.layer2 ? 'released' : 'still sealed, so he only has the agents\u2019 self-reported logs; a hint must not reveal Layer 02 facts'}. Deduction attempts: ${state.deduction.attempts}. Last grading: ${JSON.stringify(state.deduction.lastResult?.slots ?? [])}. ARCHIVE queries so far: ${state.archive.messageCount}.`,
      );
      break;
    default:
      break;
  }
  return lines.join('\n');
}

export function mockHint(config: GameConfig, state: GameState, strength: HintStrength): { hint: string; rationale: string } {
  const quick = config.hints.quick[state.stage] ?? [];
  const idx = strength === 'nudge' ? 0 : Math.min(quick.length - 1, 1);
  const hint = quick[idx] ?? 'Transmission note: re-read what the ARCHIVE has already given you. The answer is in the records.';
  return { hint, rationale: 'Mock mode: quick hint from config.' };
}

export async function draftHint(
  config: GameConfig,
  state: GameState,
  recent: GameEvent[],
  strength: HintStrength,
): Promise<{ hint: string; rationale: string; source: 'ai' | 'mock' }> {
  if (!aiLive()) return { ...mockHint(config, state, strength), source: 'mock' };
  const events = recent
    .slice(-20)
    .map((e) => `${new Date(e.ts).toISOString().slice(11, 19)} ${e.type} ${JSON.stringify(e.payload).slice(0, 160)}`)
    .join('\n');
  const prompt = `${describeStage(config, state)}\n\nRecent activity:\n${events || '(none)'}\n\nRequested strength: ${strength}. Draft the hint.`;
  const run = await runAgent({
    prompt,
    systemPrompt: COPILOT_SYSTEM_PROMPT,
    outputFormat: { type: 'json_schema', schema: HINT_SCHEMA },
    maxTurns: 3,
    effort: 'medium',
    persist: false,
    timeoutMs: 90_000,
  });
  const data = run.structured as { hint?: string; rationale?: string } | undefined;
  if (!data?.hint) throw new Error('copilot returned no hint');
  return { hint: data.hint, rationale: data.rationale ?? '', source: 'ai' };
}
