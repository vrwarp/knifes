import { callLog } from '../../test/live.js';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env.js';
import { probeAuth } from './agent.js';
import { ClaudeLogin, LoginError, envCredentialShadowsLogin } from './login.js';

// Signing the container in from the GM console, against the stand-in CLI's `auth login`.

const creds = () => path.join(env.claudeConfigDir, '.credentials.json');
const staging = () => path.join(env.dataDir, 'claude-login');
let login: ClaudeLogin;

beforeEach(() => {
  fs.rmSync(creds(), { force: true });
  login = new ClaudeLogin();
});
afterEach(async () => {
  login.cancel();
  fs.rmSync(creds(), { force: true });
  vi.unstubAllEnvs();
});

describe('Claude sign-in from the console', () => {
  it('offers the sign-in link, and a good code becomes the login the SDK reads', async () => {
    const log = callLog();
    const { id, url } = await login.start();
    expect(url).toBe('https://claude.ai/oauth/authorize?code=true&client_id=test&state=abc123');
    expect(login.inProgress).toEqual({ id, url });
    expect(fs.existsSync(path.join(staging(), id))).toBe(true);
    const r = await login.submit(id, '  good-code  ');
    expect(r.ok).toBe(true);
    expect(fs.existsSync(creds())).toBe(true);
    expect(fs.statSync(creds()).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(staging(), id)), 'the staging copy is gone').toBe(false);
    expect(login.inProgress).toBeNull();
    // The CLI signs in against the staging directory, without the ambient key that would skip the flow.
    const signIn = log().find((t) => (t.kind as string) === 'auth_login') as unknown as { configDir: string; hasAmbientKey: boolean; argv: string[] };
    expect(signIn.configDir).toBe(path.join(staging(), id));
    expect(signIn.hasAmbientKey).toBe(false);
    expect(signIn.argv).toEqual(['auth', 'login', '--claudeai']);
  });

  it('a wrong code leaves no login behind and says why', async () => {
    const { id } = await login.start();
    const r = await login.submit(id, 'wrong-code');
    expect(r).toEqual({ ok: false, error: 'Invalid authorization code' });
    expect(fs.existsSync(creds())).toBe(false);
    expect(fs.existsSync(path.join(staging(), id))).toBe(false);
    expect(login.inProgress).toBeNull();
  });

  it('refuses a stale sign-in, a code used twice, and an empty paste', async () => {
    const first = await login.start();
    expect(await login.submit(first.id, '   ')).toEqual({ ok: false, error: 'Paste the code Claude showed you.' });
    const second = await login.start();
    expect(await login.submit(first.id, 'good-code')).toEqual({ ok: false, error: 'That sign-in has expired. Start again.' });
    const done = login.submit(second.id, 'good-code');
    expect(await login.submit(second.id, 'good-code')).toEqual({ ok: false, error: 'That code was already used. Start again.' });
    expect((await done).ok).toBe(true);
  });

  it('a new start replaces a half-finished one, and cancel clears it', async () => {
    const a = await login.start();
    const b = await login.start();
    expect(b.id).not.toBe(a.id);
    expect(fs.existsSync(path.join(staging(), a.id))).toBe(false);
    login.cancel();
    expect(login.inProgress).toBeNull();
    expect(fs.existsSync(path.join(staging(), b.id))).toBe(false);
  });

  it('reports a CLI that exits without a link, and a missing binary, as a sign-in error', async () => {
    vi.stubEnv('FAKE_LOGIN_NO_URL', '1');
    const err = await login.start().catch((e) => e);
    expect(err).toBeInstanceOf(LoginError);
    expect((err as LoginError).status).toBe(502);
    expect((err as Error).message).toMatch(/no browser and no link/);
    vi.unstubAllEnvs();
    vi.stubEnv('CLAUDE_BINARY', path.join(env.dataDir, 'no-such-claude'));
    const missing = await login.start().catch((e) => e);
    expect(missing).toBeInstanceOf(LoginError);
    expect(login.inProgress).toBeNull();
  });

  it('sign-out removes the login file and the probe sees it go', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { id } = await login.start();
    await login.submit(id, 'good-code');
    expect(await probeAuth(true)).toBe('ok');
    await login.signOut();
    expect(fs.existsSync(creds())).toBe(false);
    expect(await probeAuth(true)).toBe('needs_login');
  });

  it('knows an environment credential outranks a console sign-in', () => {
    expect(envCredentialShadowsLogin()).toBe(true);
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(envCredentialShadowsLogin()).toBe(false);
    vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'sk-ant-oat01-x');
    expect(envCredentialShadowsLogin()).toBe(true);
  });
});
