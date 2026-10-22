import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const dataDir = path.resolve(str('DATA_DIR', path.resolve(process.cwd(), '../data')));
const aiModeRaw = str('AI_MODE', 'auto');

export const env = {
  port: int('PORT', 8080),
  dataDir,
  dbPath: path.join(dataDir, 'section30.sqlite'),
  uploadsDir: path.join(dataDir, 'uploads'),
  agentCwd: path.join(dataDir, 'agent-cwd'),
  claudeConfigDir: path.resolve(str('CLAUDE_CONFIG_DIR', path.join(dataDir, 'claude'))),
  gmPassword: str('GM_PASSWORD', ''),
  sessionSecret: str('SESSION_SECRET', ''),
  playerKey: str('PLAYER_KEY', ''),
  /** 'mock' forces mock AI, 'live' and 'auto' both go live whenever a credential is present. */
  aiMode: (aiModeRaw === 'mock' ? 'mock' : aiModeRaw === 'live' ? 'live' : 'auto') as 'mock' | 'live' | 'auto',
  claudeModel: str('CLAUDE_MODEL', 'claude-opus-5-5'),
  aiTimeoutMs: int('AI_TIMEOUT_MS', 120_000),
  clientDist: path.resolve(str('CLIENT_DIST', path.resolve(process.cwd(), '../client/dist'))),
  cookieSecure: str('COOKIE_SECURE', '0') === '1',
  /** Browser key for the Maps JavaScript API; the location puzzle embeds Street View when it is set. */
  googleMapsApiKey: str('GOOGLE_MAPS_API_KEY', '').trim(),
};

export function ensureDirs(): void {
  for (const d of [env.dataDir, env.uploadsDir, env.agentCwd, env.claudeConfigDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

/** Where the key that signs GM logins and the player's link cookie came from. */
export type SecretSource = 'env' | 'data' | 'memory';
let secretCache: { value: string; source: SecretSource } | null = null;

/**
 * SESSION_SECRET when it is set. Otherwise a key made once and kept in the data directory, so a
 * container restart in the middle of the evening logs nobody out and, with a PLAYER_KEY, never
 * turns the phone away. Only when the data directory cannot be written does it live for one boot.
 */
export function sessionSecret(): { value: string; source: SecretSource } {
  if (secretCache) return secretCache;
  if (env.sessionSecret) return (secretCache = { value: env.sessionSecret, source: 'env' });
  const file = path.join(env.dataDir, 'session-secret');
  const read = () => {
    try {
      const v = fs.readFileSync(file, 'utf8').trim();
      return v.length >= 32 ? v : null;
    } catch {
      return null;
    }
  };
  const saved = read();
  if (saved) return (secretCache = { value: saved, source: 'data' });
  const fresh = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(env.dataDir, { recursive: true });
    fs.writeFileSync(file, fresh, { mode: 0o600, flag: 'wx' });
    return (secretCache = { value: fresh, source: 'data' });
  } catch (err) {
    const other = (err as NodeJS.ErrnoException).code === 'EEXIST' ? read() : null;
    if (other) return (secretCache = { value: other, source: 'data' });
    console.warn('[section30] could not keep the session secret in the data directory; logins end at the next restart', err);
    return (secretCache = { value: fresh, source: 'memory' });
  }
}

/**
 * Where Claude Code will find a credential, in the CLI's own precedence order:
 * bearer token, API key, long-lived subscription token from `claude setup-token`,
 * then a `.credentials.json` written by `claude auth login` into CLAUDE_CONFIG_DIR.
 */
export type CredentialSource = 'auth_token' | 'api_key' | 'oauth_token' | 'login' | 'none';

export function detectCredential(e: NodeJS.ProcessEnv = process.env, configDir = env.claudeConfigDir): CredentialSource {
  if (e.ANTHROPIC_AUTH_TOKEN?.trim()) return 'auth_token';
  if (e.ANTHROPIC_API_KEY?.trim()) return 'api_key';
  if (e.CLAUDE_CODE_OAUTH_TOKEN?.trim()) return 'oauth_token';
  try {
    if (fs.existsSync(path.join(configDir, '.credentials.json'))) return 'login';
  } catch {
    // unreadable config dir counts as no credential
  }
  return 'none';
}

export const CREDENTIAL_LABEL: Record<CredentialSource, string> = {
  auth_token: 'bearer token (ANTHROPIC_AUTH_TOKEN)',
  api_key: 'API key (ANTHROPIC_API_KEY)',
  oauth_token: 'subscription token (CLAUDE_CODE_OAUTH_TOKEN)',
  login: 'subscription login (.credentials.json)',
  none: 'none',
};
