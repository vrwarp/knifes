import { gradeFallback } from '../game/grader.js';
import { SLOT_IDS, type GradeResult, type SlotGrade, type SlotId, type SlotSpec } from '../types.js';
import { aiLive, runAgent } from './agent.js';

const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    slots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: SLOT_IDS },
          pass: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['id', 'pass', 'reason'],
      },
    },
  },
  required: ['slots'],
};

const GRADER_SYSTEM_PROMPT = `You are the verification subsystem for a live murder-mystery party game. A player has filled six free-text fields of a deduction sentence. For each field, decide whether the player's answer means the same thing as the canonical answer.

Judge meaning, not wording. Accept abbreviations, typos, nicknames, extra words and different phrasings that clearly point at the same fact. Treat the "accept" list as examples of passing phrasings and the "reject" list as answers that must fail even if other words also appear. An empty or evasive answer fails. Do not reward hedged answers that list several alternatives. Return one entry per field id with a one-sentence reason.`;

function buildPrompt(slots: SlotSpec[], answers: Record<SlotId, string>): string {
  const parts = slots.map(
    (s) =>
      `FIELD ${s.id} (${s.label})\n` +
      `Canonical answer: ${s.canonical}\n` +
      `Accept examples: ${s.accept.join(' | ') || '(none)'}\n` +
      `Reject examples: ${s.reject.join(' | ') || '(none)'}\n` +
      `Guidance: ${s.guidance}\n` +
      `Player answer: """${(answers[s.id] ?? '').slice(0, 300)}"""`,
  );
  return `Grade every field below.\n\n${parts.join('\n\n')}`;
}

export async function gradeDeduction(slots: SlotSpec[], answers: Record<SlotId, string>): Promise<GradeResult> {
  const fallback = gradeFallback(slots, answers);
  if (!aiLive()) return fallback;
  try {
    const run = await runAgent({
      prompt: buildPrompt(slots, answers),
      systemPrompt: GRADER_SYSTEM_PROMPT,
      outputFormat: { type: 'json_schema', schema: GRADE_SCHEMA },
      maxTurns: 3,
      effort: 'medium',
      persist: false,
      timeoutMs: 90_000,
    });
    const data = run.structured as { slots?: SlotGrade[] } | undefined;
    if (!data?.slots?.length) throw new Error('grader returned no structured output');
    const byId = new Map(data.slots.map((g) => [g.id, g]));
    const graded: SlotGrade[] = slots.map((s) => {
      const g = byId.get(s.id);
      if (g) return { id: s.id, pass: Boolean(g.pass), reason: String(g.reason ?? '') };
      const fb = fallback.slots.find((f) => f.id === s.id)!;
      return { ...fb, reason: `${fb.reason} (fallback: grader omitted this field)` };
    });
    return { pass: graded.every((g) => g.pass), slots: graded, source: 'ai' };
  } catch (err) {
    return { ...fallback, note: `AI grader unavailable, deterministic fallback used: ${(err as Error).message}` };
  }
}
