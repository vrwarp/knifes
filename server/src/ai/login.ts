/**
 * Sign the container into Claude from the GM console, the way FanZiTong does it.
 *
 * `claude auth login` drives cleanly over pipes: it prints a URL, waits at a
 * "paste code" prompt, and exits 0 once the pasted code is accepted. The GM
 * opens the link, approves on Claude's site, and pastes the code back; nobody
 * needs a shell in the container. The GM console's password already gates who
 * can do this, so there is no separate ownership lock.
 *
 * Each attempt signs in against a staging directory and only a successful one
 * replaces the credentials the SDK reads, so a failed or abandoned attempt
 * never breaks a working login.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { detectCredential, env } from '../env.js';
import { findClaudeBinary, probeAuth } from './agent.js';

const LOGIN_TIMEOUT_MS = 10 * 60_000;
const URL_TIMEOUT_MS = 60_000;
const CODE_TIMEOUT_MS = 2 * 60_000;

export interface Account {
  email?: string;
  organization?: string;
  subscriptionType?: string;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  account?: Account | null;
}

interface Pending {
  id: string;
  url: string;
  child: ChildProcessWithoutNullStreams;
  dir: string;
  stderr: string;
  timer: NodeJS.Timeout;
  done: Promise<{ code: number | null }>;
  codeSent: boolean;
}

export class LoginError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const credentialsFile = (dir: string) => path.join(dir, '.credentials.json');
const stagingRoot = () => path.join(env.dataDir, 'claude-login');

/** Environment-supplied credentials outrank a login file, so a web sign-in would be ignored. */
export function envCredentialShadowsLogin(): boolean {
  const source = detectCredential();
  return source === 'auth_token' || source === 'api_key' || source === 'oauth_token';
}

/** Ask Claude Code which account a config directory is signed in as. Costs no tokens. */
export async function readAccount(configDir = env.claudeConfigDir): Promise<Account | null> {
  const binary = findClaudeBinary();
  const idle = (async function* () {
    await new Promise(() => {});
    yield undefined as never;
  })();
  const q = query({
    prompt: idle as never,
    options: {
      tools: [],
      settingSources: [],
      cwd: env.agentCwd,
      ...(binary ? { pathToClaudeCodeExecutable: binary } : {}),
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    },
  });
  try {
    const init = await Promise.race([
      q.initializationResult(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 30_000)),
    ]);
    const a = (init as { account?: Account }).account;
    return a ? { email: a.email, organization: a.organization, subscriptionType: a.subscriptionType } : null;
  } catch {
    return null;
  } finally {
    await q.return(undefined as never).catch(() => undefined);
  }
}

export class ClaudeLogin {
  private pending: Pending | null = null;

  get inProgress(): { id: string; url: string } | null {
    return this.pending ? { id: this.pending.id, url: this.pending.url } : null;
  }

  /** Start a sign-in and return the link to open. Replaces any half-finished one. */
  async start(): Promise<{ id: string; url: string }> {
    const binary = findClaudeBinary();
    if (!binary) throw new LoginError('Claude Code is not installed in this container.', 500);
    this.cancel();

    const id = randomUUID();
    const dir = path.join(stagingRoot(), id);
    fs.mkdirSync(dir, { recursive: true });
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      CLAUDE_CONFIG_DIR: dir,
      // Nothing to open in a container: the CLI prints the URL instead.
      BROWSER: '/bin/true',
    };
    // An ambient credential would make the CLI skip the flow being driven here.
    delete childEnv.CLAUDE_CODE_OAUTH_TOKEN;
    delete childEnv.ANTHROPIC_API_KEY;
    delete childEnv.ANTHROPIC_AUTH_TOKEN;

    const child = spawn(binary, ['auth', 'login', '--claudeai'], { env: childEnv });
    const entry: Pending = {
      id,
      url: '',
      child,
      dir,
      stderr: '',
      codeSent: false,
      timer: setTimeout(() => this.cancel(id), LOGIN_TIMEOUT_MS),
      done: new Promise((resolve) => child.once('exit', (code) => resolve({ code }))),
    };
    this.pending = entry;
    child.stderr.on('data', (d: Buffer) => (entry.stderr += d.toString()));

    try {
      entry.url = await new Promise<string>((resolve, reject) => {
        let out = '';
        const deadline = setTimeout(() => reject(new Error('Claude Code did not offer a sign-in link.')), URL_TIMEOUT_MS);
        child.stdout.on('data', (d: Buffer) => {
          out += d.toString();
          const m = /https:\/\/\S+/.exec(out);
          if (m) {
            clearTimeout(deadline);
            resolve(m[0].replace(/[.,)]+$/, ''));
          }
        });
        child.once('error', (e) => {
          clearTimeout(deadline);
          reject(e);
        });
        child.once('exit', (code) => {
          clearTimeout(deadline);
          reject(new Error(entry.stderr.trim() || `Claude Code exited (${code}) before offering a link.`));
        });
      });
    } catch (e) {
      this.cancel(id);
      throw new LoginError(e instanceof Error ? e.message : String(e), 502);
    }
    console.log('[section30] Claude sign-in started from the GM console');
    return { id, url: entry.url };
  }

  /** Hand the pasted code to the waiting CLI; on success, make the new login the one the SDK uses. */
  async submit(id: string, code: string): Promise<LoginResult> {
    const entry = this.pending;
    if (!entry || entry.id !== id) return { ok: false, error: 'That sign-in has expired. Start again.' };
    if (entry.codeSent) return { ok: false, error: 'That code was already used. Start again.' };
    const clean = code.trim();
    if (!clean) return { ok: false, error: 'Paste the code Claude showed you.' };
    entry.codeSent = true;
    entry.child.stdin.write(`${clean}\n`);

    const outcome = await Promise.race([
      entry.done,
      new Promise<{ code: null; timedOut: true }>((r) => setTimeout(() => r({ code: null, timedOut: true }), CODE_TIMEOUT_MS)),
    ]);
    if (outcome.code !== 0 || !fs.existsSync(credentialsFile(entry.dir))) {
      const failure = /Login failed:?\s*(.*)/i.exec(entry.stderr)?.[1]?.trim();
      this.cancel(id);
      return {
        ok: false,
        error: 'timedOut' in outcome ? 'Claude did not answer in time. Start again.' : failure || 'The code was not accepted. Start again and copy the newest code.',
      };
    }

    // Promote the staged credentials atomically into the directory the SDK reads.
    fs.mkdirSync(env.claudeConfigDir, { recursive: true });
    const target = credentialsFile(env.claudeConfigDir);
    const tmp = `${target}.${id}`;
    fs.writeFileSync(tmp, fs.readFileSync(credentialsFile(entry.dir)), { mode: 0o600 });
    fs.renameSync(tmp, target);
    this.cleanup(entry);
    await probeAuth(true);
    console.log('[section30] Claude sign-in completed from the GM console');
    return { ok: true, account: await readAccount() };
  }

  cancel(id?: string): void {
    const entry = this.pending;
    if (!entry || (id && entry.id !== id)) return;
    entry.child.kill('SIGKILL');
    this.cleanup(entry);
  }

  /** Remove the login file. Credentials supplied through the environment are untouched. */
  async signOut(): Promise<void> {
    this.cancel();
    fs.rmSync(credentialsFile(env.claudeConfigDir), { force: true });
    await probeAuth(true);
  }

  private cleanup(entry: Pending): void {
    clearTimeout(entry.timer);
    if (this.pending === entry) this.pending = null;
    fs.rmSync(entry.dir, { recursive: true, force: true });
  }
}
