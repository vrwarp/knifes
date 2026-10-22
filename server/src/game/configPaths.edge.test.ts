import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../defaultConfig.js';
import { diffPaths, getPath, preview, setPath } from './configPaths.js';

/** Every leaf path of a value, the way an assistant proposal names a setting. */
function leaves(v: unknown, prefix = ''): string[] {
  if (Array.isArray(v)) return v.length && v.some((x) => typeof x === 'object' && x !== null) ? v.flatMap((x, i) => leaves(x, `${prefix}.${i}`)) : [prefix];
  if (typeof v === 'object' && v !== null) return Object.entries(v).flatMap(([k, x]) => leaves(x, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

describe('config paths, against the whole configuration', () => {
  const paths = leaves(DEFAULT_CONFIG).filter((p) => p !== 'version');
  it('every setting can be read and written back by its path, without touching the original', () => {
    expect(paths.length).toBeGreaterThan(250);
    const before = JSON.stringify(DEFAULT_CONFIG);
    const changedValue = (v: unknown) => (typeof v === 'number' ? v + 1 : typeof v === 'boolean' ? !v : typeof v === 'string' ? `${v}x` : Array.isArray(v) ? [...v, 'x'] : 'x');
    for (const p of paths) {
      const v = getPath(DEFAULT_CONFIG, p);
      expect(JSON.stringify(setPath(DEFAULT_CONFIG, p, v)), p).toBe(before);
      // Changing one setting shows up as exactly that one change in the history.
      expect(diffPaths(DEFAULT_CONFIG, setPath(DEFAULT_CONFIG, p, changedValue(v))), p).toEqual([p]);
    }
    expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
  });
  it('refuses paths that are not settings', () => {
    for (const bad of ['', '.', 'nope', 'gate.nope', 'gate.code.length', 'title.0', 'hack.wordBank.x', 'hack.wordBank.-1', 'hack.wordBank.99', 'hack.wordBank.1.5', 'ledger.content.agents.0.log.999.time', 'version', 'constructor', '__proto__', 'gate.__proto__.x', 'gate.hasOwnProperty', 'hints.quick.toString']) {
      expect(() => setPath(DEFAULT_CONFIG, bad, 1), bad).toThrow();
    }
  });
  it('reads nothing through the prototype chain', () => {
    expect(getPath(DEFAULT_CONFIG, '__proto__')).toBeUndefined();
    expect(getPath(DEFAULT_CONFIG, 'gate.toString')).toBeUndefined();
    expect(getPath(DEFAULT_CONFIG, 'gate.code.length')).toBeUndefined();
    expect(getPath(DEFAULT_CONFIG, 'hack.wordBank.0')).toBe('STEALTH');
  });
});

describe('diffPaths', () => {
  it('reports lists of objects of a different length as one change, and nested lists by index', () => {
    const a = { agents: [{ id: 'a', log: [{ t: 1 }] }] };
    expect(diffPaths(a, { agents: [{ id: 'a', log: [{ t: 1 }] }, { id: 'b', log: [] }] })).toEqual(['agents']);
    expect(diffPaths(a, { agents: [{ id: 'a', log: [{ t: 2 }] }] })).toEqual(['agents.0.log.0.t']);
    expect(diffPaths(a, { agents: [{ id: 'a', log: [{ t: 1 }, { t: 2 }] }] })).toEqual(['agents.0.log']);
  });
  it('tells null, missing and empty apart, and handles values that are not objects', () => {
    expect(diffPaths({ a: null }, { a: undefined })).toEqual(['a']);
    expect(diffPaths({ a: null }, {})).toEqual(['a']);
    expect(diffPaths({ a: [] }, { a: {} })).toEqual(['a']);
    expect(diffPaths(1, 2)).toEqual(['(root)']);
    expect(diffPaths(NaN, NaN)).toEqual([]);
    expect(diffPaths({ version: 1, a: 1 }, { version: 2, a: 1 })).toEqual([]);
    expect(diffPaths({ x: { version: 1 } }, { x: { version: 2 } })).toEqual(['x.version']);
  });
});

describe('preview', () => {
  it('quotes strings, shows absent values as null, and cuts long ones with an ellipsis', () => {
    expect(preview('S30GHOST')).toBe('"S30GHOST"');
    expect(preview(undefined)).toBe('null');
    expect(preview({ lat: 1, lng: 2 })).toBe('{"lat":1,"lng":2}');
    const long = preview('x'.repeat(500), 40);
    expect(long).toHaveLength(40);
    expect(long.endsWith('…')).toBe(true);
  });
});
