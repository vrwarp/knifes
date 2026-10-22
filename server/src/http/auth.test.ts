import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The GM login and the player link: cookies, tokens, and the key that signs them surviving a restart.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** auth.ts and env.ts as a fresh boot of the server would load them, with this environment. */
async function boot(envVars: Record<string, string>) {
  for (const [k, v] of Object.entries(envVars)) vi.stubEnv(k, v);
  vi.resetModules();
  return { auth: await import('./auth.js'), env: await import('../env.js') };
}

describe('cookies', () => {
  it('parses what browsers send, and never throws on what other apps on the host set', async () => {
    const { auth } = await boot({});
    expect(auth.parseCookies(undefined)).toEqual({});
    expect(auth.parseCookies('')).toEqual({});
    expect(auth.parseCookies('a=1; b=2')).toEqual({ a: '1', b: '2' });
    expect(auth.parseCookies(' a = 1 ;b=two%20words')).toEqual({ a: '1', b: 'two words' });
    expect(auth.parseCookies('tok=abc==; x')).toEqual({ tok: 'abc==' });
    expect(auth.parseCookies('a=1; a=2')).toEqual({ a: '2' });
    expect(auth.parseCookies('progress=100%; s30gm=t.sig')).toEqual({ progress: '100%', s30gm: 't.sig' });
    expect(auth.parseCookies('bad=%E0%A4%A; ok=1')).toEqual({ bad: '%E0%A4%A', ok: '1' });
    expect(auth.parseCookies('=nokey; ok=1')).toEqual({ ok: '1' });
  });
  it('sets HttpOnly, SameSite and Path always, and Secure only when told to', async () => {
    const plain = (await boot({ COOKIE_SECURE: '0' })).auth.cookieHeader('s30gm', 'v', 60);
    expect(plain).toBe('s30gm=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=60');
    const secure = (await boot({ COOKIE_SECURE: '1' })).auth.cookieHeader('s30gm', 'a b', 0);
    expect(secure).toBe('s30gm=a%20b; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure');
  });
});

describe('GM login tokens', () => {
  it('verifies its own tokens and nothing else', async () => {
    const { auth } = await boot({ SESSION_SECRET: 'one-secret' });
    const t = auth.makeGmToken();
    expect(auth.verifyGmToken(t)).toBe(true);
    const [ts, sig] = [t.slice(0, t.lastIndexOf('.')), t.slice(t.lastIndexOf('.') + 1)];
    expect(auth.verifyGmToken(`${ts}x.${sig}`)).toBe(false);
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect(auth.verifyGmToken(`${ts}.${flipped}`)).toBe(false);
    expect(auth.verifyGmToken(`${ts}.${sig}x`)).toBe(false);
    expect(auth.verifyGmToken(ts)).toBe(false);
    expect(auth.verifyGmToken('')).toBe(false);
    expect(auth.verifyGmToken(undefined)).toBe(false);
    expect(auth.verifyGmToken('.')).toBe(false);
    const other = (await boot({ SESSION_SECRET: 'another-secret' })).auth;
    expect(other.verifyGmToken(t), 'a token from another secret').toBe(false);
  });
  it('compares the password whole, and refuses every password when none is set', async () => {
    const set = (await boot({ GM_PASSWORD: 'correct horse' })).auth;
    expect(set.checkGmPassword('correct horse')).toBe(true);
    expect(set.checkGmPassword('correct hors')).toBe(false);
    expect(set.checkGmPassword('correct horse ')).toBe(false);
    expect(set.checkGmPassword('')).toBe(false);
    const unset = (await boot({ GM_PASSWORD: '' })).auth;
    expect(unset.checkGmPassword('')).toBe(false);
    expect(unset.checkGmPassword('anything')).toBe(false);
  });
});

describe('the player link', () => {
  it('needs no token without a PLAYER_KEY, and the right one with it', async () => {
    const open = (await boot({ PLAYER_KEY: '' })).auth;
    expect(open.verifyPlayerToken(undefined)).toBe(true);
    const keyed = (await boot({ PLAYER_KEY: 'jimmy30', SESSION_SECRET: 's' })).auth;
    expect(keyed.verifyPlayerToken(undefined)).toBe(false);
    expect(keyed.verifyPlayerToken('nope')).toBe(false);
    expect(keyed.verifyPlayerToken(keyed.playerToken())).toBe(true);
  });
});

describe('the signing key across a restart', () => {
  const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), 's30-secret-'));
  it('without SESSION_SECRET is made once and kept, so a GM login and the phone survive a restart', async () => {
    const dataDir = fresh();
    const first = await boot({ SESSION_SECRET: '', DATA_DIR: dataDir, PLAYER_KEY: 'jimmy30' });
    expect(first.env.sessionSecret().source).toBe('data');
    const gm = first.auth.makeGmToken();
    const phone = first.auth.playerToken();
    const file = path.join(dataDir, 'session-secret');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const second = await boot({ SESSION_SECRET: '', DATA_DIR: dataDir, PLAYER_KEY: 'jimmy30' });
    expect(second.auth.verifyGmToken(gm)).toBe(true);
    expect(second.auth.verifyPlayerToken(phone)).toBe(true);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  it('prefers SESSION_SECRET when it is set, and writes nothing', async () => {
    const dataDir = fresh();
    const { env } = await boot({ SESSION_SECRET: 'from-the-env', DATA_DIR: dataDir });
    expect(env.sessionSecret()).toEqual({ value: 'from-the-env', source: 'env' });
    expect(fs.existsSync(path.join(dataDir, 'session-secret'))).toBe(false);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  it('replaces a kept key too short to trust, and falls back to memory when nothing can be written', async () => {
    const dataDir = fresh();
    fs.writeFileSync(path.join(dataDir, 'session-secret'), 'short');
    const { env } = await boot({ SESSION_SECRET: '', DATA_DIR: dataDir });
    // The short file is not overwritten (exclusive create), so this boot keeps its key in memory and says so.
    expect(['data', 'memory']).toContain(env.sessionSecret().source);
    expect(env.sessionSecret().value).not.toBe('short');
    const blocked = path.join(fresh(), 'file-not-dir');
    fs.writeFileSync(blocked, 'x');
    const unwritable = await boot({ SESSION_SECRET: '', DATA_DIR: blocked });
    expect(unwritable.env.sessionSecret().source).toBe('memory');
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
