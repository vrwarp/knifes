import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../defaultConfig.js';
import { gradeFallback, gradeSlotFallback } from './grader.js';

const slot = (id: string) => DEFAULT_CONFIG.deduction.slots.find((s) => s.id === id)!;

describe('gradeSlotFallback', () => {
  it('accepts phrasings of the right answer', () => {
    expect(gradeSlotFallback(slot('time'), '3:45 am').pass).toBe(true);
    expect(gradeSlotFallback(slot('suspect'), 'agent vector').pass).toBe(true);
    expect(gradeSlotFallback(slot('method'), 'Poisoned tea').pass).toBe(true);
    expect(gradeSlotFallback(slot('asset'), 'the ledger').pass).toBe(true);
    expect(gradeSlotFallback(slot('motive'), 'to sell it for money').pass).toBe(true);
    expect(gradeSlotFallback(slot('prop'), 'birthday card envelope').pass).toBe(true);
  });
  it('rejects wrong or red-herring answers', () => {
    expect(gradeSlotFallback(slot('time'), '4:15').pass).toBe(false);
    expect(gradeSlotFallback(slot('suspect'), 'Agent Cipher').pass).toBe(false);
    expect(gradeSlotFallback(slot('method'), 'letter opener').pass).toBe(false);
    expect(gradeSlotFallback(slot('prop'), 'the water bottle').pass).toBe(false);
    expect(gradeSlotFallback(slot('prop'), '').pass).toBe(false);
  });
  it('fails a hedge that names a rejected term next to the answer', () => {
    expect(gradeSlotFallback(slot('suspect'), 'vector or cipher').pass).toBe(false);
  });
});

describe('gradeFallback', () => {
  it('passes only when every slot passes', () => {
    const good = gradeFallback(DEFAULT_CONFIG.deduction.slots, {
      time: '03:45',
      suspect: 'Vector',
      method: 'neurotoxin in the earl grey',
      asset: 'drive 30-alpha',
      motive: 'syndicate buyer',
      prop: 'the envelope',
    });
    expect(good.pass).toBe(true);
    expect(good.source).toBe('fallback');
    const bad = gradeFallback(DEFAULT_CONFIG.deduction.slots, { ...goodAnswers(), suspect: 'Sentinel' });
    expect(bad.pass).toBe(false);
    expect(bad.slots.find((s) => s.id === 'suspect')?.pass).toBe(false);
  });
});

function goodAnswers() {
  return { time: '03:45', suspect: 'Vector', method: 'poison', asset: 'ledger', motive: 'sell', prop: 'card' } as const;
}
