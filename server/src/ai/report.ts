import type { ArchiveMessage, GameConfig, GameEvent, GameState } from '../types.js';
import { aiLive, runAgent } from './agent.js';

const REPORT_SYSTEM_PROMPT = `You write the closing case file for a live murder-mystery party game, in the voice of Section 30, an off-the-books counter-cyberintelligence cell. The detective is Jimmy, who is celebrating his thirtieth birthday; the case is the death of Director Arthur Pendelton. You receive the full activity log of the evening.

Write in Markdown, 350 to 600 words, with these headings: CASE FILE 30-0214, Recovery Chain, The Interrogation, Commendation. The recovery chain ran from a letter at church through a drop at Lake Elizabeth, a call to Phil, and a word race, to the S30 Ledger's personnel files and surveillance records; the interrogation covers the ARCHIVE queries and the release of the surveillance records. Stay in-world: dry, affectionate, lightly wry about any lockouts or wrong turns, never mocking. Quote one or two of the detective's actual ARCHIVE questions if any were asked. Use the real timestamps and counts from the log. Do not mention AI, prompts, game masters or the app. End with the line "Filed by ARCHIVE. Integrity restored."`;

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

export function buildReportPrompt(config: GameConfig, state: GameState, events: GameEvent[], archive: ArchiveMessage[]): string {
  const timeline = events
    .map((e) => `${fmt(e.ts)} ${e.type} ${JSON.stringify(e.payload).slice(0, 200)}`)
    .join('\n');
  const chat = archive.map((m) => `${fmt(m.ts)} ${m.role.toUpperCase()}: ${m.text.slice(0, 400)}`).join('\n');
  return `Title: ${config.title}
Started: ${state.startedAt ? fmt(state.startedAt) : 'unknown'}
Stage times: ${JSON.stringify(state.stageTimes)}
Geo attempts: ${state.geo.attempts}. Gate attempts: ${state.gate.attempts}. Word puzzle guesses: ${state.hack.guesses.length} (lockouts ${state.hack.rounds}${config.hack.mode === 'race' ? '; he raced a hostile AI process for the same key, see the hack_ai_* and hack_round events' : ''}).
Surveillance records released: ${state.ledger.layer2 ? 'yes' : 'no'}

Activity log:
${timeline || '(none)'}

ARCHIVE transcript:
${chat || '(no questions asked)'}

Write the case file now.`;
}

export function mockReport(config: GameConfig, state: GameState, events: GameEvent[], archive: ArchiveMessage[]): string {
  const asked = archive.filter((m) => m.role === 'user').slice(0, 2);
  return `# CASE FILE 30-0214

## Recovery Chain
Detective Jimmy engaged the emergency failsafe recovery protocol${state.startedAt ? ` at ${fmt(state.startedAt)}` : ''}. The code gate fell on attempt ${state.gate.attempts || 1}. The Ledger key yielded after ${state.hack.guesses.length} key attempt${state.hack.guesses.length === 1 ? '' : 's'}${state.hack.rounds ? ` and ${state.hack.rounds} reset${state.hack.rounds === 1 ? '' : 's'}` : ''}.

## The Interrogation
${archive.length ? `The Detective put ${state.archive.messageCount} queries to the ARCHIVE.${asked.length ? ` Among them: "${asked.map((m) => m.text).join('" and "')}".` : ''}` : 'The Detective did not consult the ARCHIVE. The records note this with something like admiration.'}${state.ledger.layer2 ? ` The surveillance records were released by command authority.` : ' The surveillance records were never released.'}

${events.length} events were logged across the evening.

## Commendation
${config.title}: closed. Pendelton spent thirty years deciding whom to trust. His last decision held.

Filed by ARCHIVE. Integrity restored.`;
}

export async function generateReport(
  config: GameConfig,
  state: GameState,
  events: GameEvent[],
  archive: ArchiveMessage[],
): Promise<{ markdown: string; source: 'ai' | 'mock' }> {
  if (!aiLive()) return { markdown: mockReport(config, state, events, archive), source: 'mock' };
  const run = await runAgent({
    prompt: buildReportPrompt(config, state, events, archive),
    systemPrompt: REPORT_SYSTEM_PROMPT,
    maxTurns: 2,
    effort: 'high',
    persist: false,
    timeoutMs: 180_000,
  });
  if (!run.text.trim()) throw new Error('report came back empty');
  return { markdown: run.text, source: 'ai' };
}
