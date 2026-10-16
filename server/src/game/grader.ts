import type { GradeResult, SlotId, SlotSpec } from '../types.js';

export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9:' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matches(answer: string, variant: string): boolean {
  const v = normalizeAnswer(variant);
  if (!v) return false;
  return answer.includes(v);
}

export function gradeSlotFallback(spec: SlotSpec, rawAnswer: string): { pass: boolean; reason: string } {
  const answer = normalizeAnswer(rawAnswer);
  if (!answer) return { pass: false, reason: 'empty' };
  const accepted = [spec.canonical, ...spec.accept].some((v) => matches(answer, v));
  const rejected = spec.reject.some((v) => matches(answer, v));
  if (accepted && !rejected) return { pass: true, reason: 'matched accepted phrasing' };
  if (accepted && rejected) return { pass: false, reason: 'mentions a rejected term alongside the answer' };
  if (rejected) return { pass: false, reason: 'matched a rejected term' };
  return { pass: false, reason: 'no accepted phrasing found' };
}

export function gradeFallback(slots: SlotSpec[], answers: Record<SlotId, string>): GradeResult {
  const graded = slots.map((spec) => {
    const r = gradeSlotFallback(spec, answers[spec.id] ?? '');
    return { id: spec.id, pass: r.pass, reason: r.reason };
  });
  return { pass: graded.every((g) => g.pass), slots: graded, source: 'fallback' };
}
