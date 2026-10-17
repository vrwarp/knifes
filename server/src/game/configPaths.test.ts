import { describe, expect, it } from 'vitest';
import { diffPaths, getPath, setPath } from './configPaths.js';

describe('config paths', () => {
  const a = { version: 1, gate: { code: 'A', prompt: 'p' }, hints: { geo: ['x'] }, slots: [{ id: 's', accept: ['a'] }, { id: 't', accept: [] }] };

  it('lists changed leaf paths and ignores the version', () => {
    const b = structuredClone(a);
    b.version = 9;
    b.gate.code = 'B';
    b.hints.geo = ['x', 'y'];
    b.slots[1].accept = ['z'];
    expect(diffPaths(a, b)).toEqual(['gate.code', 'hints.geo', 'slots.1.accept']);
    expect(diffPaths(a, structuredClone(a))).toEqual([]);
  });

  it('reads and sets nested paths without mutating the original', () => {
    expect(getPath(a, 'slots.0.id')).toBe('s');
    const b = setPath(a, 'gate.code', 'Q');
    expect(b.gate.code).toBe('Q');
    expect(a.gate.code).toBe('A');
    expect(setPath(a, 'slots.1.accept', ['k']).slots[1].accept).toEqual(['k']);
  });

  it('refuses unknown paths and the version', () => {
    expect(() => setPath(a, 'gate.nope', 1)).toThrow(/No such setting/);
    expect(() => setPath(a, 'slots.5.id', 1)).toThrow(/No such setting/);
    expect(() => setPath(a, 'version', 3)).toThrow(/managed/);
  });
});
