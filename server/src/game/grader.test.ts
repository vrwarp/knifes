import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../defaultConfig.js';
import { gradeFallback, gradeSlotFallback } from './grader.js';

const slot = (id: string) => {
  const s = structuredClone(DEFAULT_CONFIG.deduction.slots.find((x) => x.id === id)!);
  // The prop ships as a GM placeholder; the tests stand in for the GMs.
  if (id === 'prop') Object.assign(s, { canonical: 'the birthday card envelope', accept: ['card', 'envelope'], reject: ['book', 'bottle'] });
  return s;
};
const slots = () => DEFAULT_CONFIG.deduction.slots.map((s) => slot(s.id));

describe('gradeSlotFallback', () => {
  it('accepts phrasings of the right answer', () => {
    expect(gradeSlotFallback(slot('time'), '2:14 am').pass).toBe(true);
    expect(gradeSlotFallback(slot('time'), 'two fourteen in the morning').pass).toBe(true);
    expect(gradeSlotFallback(slot('suspect'), 'Nina').pass).toBe(true);
    expect(gradeSlotFallback(slot('suspect'), 'agent calder, S30-003').pass).toBe(true);
    expect(gradeSlotFallback(slot('method'), 'Stabbed with the letter opener').pass).toBe(true);
    expect(gradeSlotFallback(slot('asset'), 'the hard copy of the ledger').pass).toBe(true);
    expect(gradeSlotFallback(slot('motive'), 'to sell it for money').pass).toBe(true);
    expect(gradeSlotFallback(slot('prop'), 'birthday card envelope').pass).toBe(true);
  });
  it('rejects wrong or red-herring answers', () => {
    expect(gradeSlotFallback(slot('time'), '4:15').pass).toBe(false);
    expect(gradeSlotFallback(slot('time'), '2:11 am').pass).toBe(false);
    for (const other of ['Mara Voss', 'Elias', 'Theo Blackwood', 'Celeste']) expect(gradeSlotFallback(slot('suspect'), other).pass).toBe(false);
    expect(gradeSlotFallback(slot('method'), 'poisoned tea').pass).toBe(false);
    expect(gradeSlotFallback(slot('method'), 'the combat knife').pass).toBe(false);
    expect(gradeSlotFallback(slot('motive'), 'revenge for her brother').pass).toBe(false);
    expect(gradeSlotFallback(slot('prop'), 'the water bottle').pass).toBe(false);
    expect(gradeSlotFallback(slot('prop'), '').pass).toBe(false);
  });
  it('fails the prop while the GM placeholder is still set', () => {
    const raw = DEFAULT_CONFIG.deduction.slots.find((s) => s.id === 'prop')!;
    expect(gradeSlotFallback(raw, 'birthday card envelope').pass).toBe(false);
  });
  it('fails a hedge that names a rejected term next to the answer', () => {
    expect(gradeSlotFallback(slot('suspect'), 'nina or celeste').pass).toBe(false);
  });
});

describe('gradeFallback', () => {
  it('passes only when every slot passes', () => {
    const good = gradeFallback(slots(), {
      time: '02:14',
      suspect: 'Nina Calder',
      method: 'the silver letter opener',
      asset: 'the hard copy',
      motive: 'syndicate buyer',
      prop: 'the envelope',
    });
    expect(good.pass).toBe(true);
    expect(good.source).toBe('fallback');
    const bad = gradeFallback(slots(), { ...goodAnswers(), suspect: 'Theo' });
    expect(bad.pass).toBe(false);
    expect(bad.slots.find((s) => s.id === 'suspect')?.pass).toBe(false);
  });
});

function goodAnswers() {
  return { time: '2:14', suspect: 'Nina', method: 'letter opener', asset: 'ledger', motive: 'sell', prop: 'card' } as const;
}
