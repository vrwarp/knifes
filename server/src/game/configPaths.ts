/** Dotted-path helpers for configuration diffs, restores and assistant proposals. */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Paths whose values differ between two configs. Arrays of objects diff per index; other arrays as a whole. */
export function diffPaths(a: unknown, b: unknown, prefix = '', out: string[] = []): string[] {
  if (Object.is(a, b)) return out;
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!prefix && k === 'version') continue;
      diffPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.some(isObj)) {
    a.forEach((v, i) => diffPaths(v, b[i], `${prefix}.${i}`, out));
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(prefix || '(root)');
  return out;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (Array.isArray(cur)) cur = cur[Number(key)];
    else if (isObj(cur)) cur = cur[key];
    else return undefined;
  }
  return cur;
}

/** Return a copy with one path replaced. Only existing paths can be set, so typos fail loudly. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.').filter(Boolean);
  if (!keys.length) throw new Error('Empty path');
  if (keys[0] === 'version') throw new Error('version is managed by the history');
  const root = structuredClone(obj) as unknown;
  let cur = root;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const last = i === keys.length - 1;
    if (Array.isArray(cur)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) throw new Error(`No such setting: ${path}`);
      if (last) cur[idx] = value;
      else cur = cur[idx];
    } else if (isObj(cur)) {
      if (!(key in cur)) throw new Error(`No such setting: ${path}`);
      if (last) cur[key] = value;
      else cur = cur[key];
    } else {
      throw new Error(`No such setting: ${path}`);
    }
  }
  return root as T;
}

/** A short, readable rendering of a setting's value for change lists. */
export function preview(v: unknown, max = 160): string {
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v ?? null);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
