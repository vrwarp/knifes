import path from 'node:path';
import fs from 'node:fs';

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const dataDir = path.resolve(str('DATA_DIR', path.resolve(process.cwd(), '../data')));

export const env = {
  port: int('PORT', 8080),
  dataDir,
  dbPath: path.join(dataDir, 'section30.sqlite'),
  uploadsDir: path.join(dataDir, 'uploads'),
  agentCwd: path.join(dataDir, 'agent-cwd'),
  claudeConfigDir: str('CLAUDE_CONFIG_DIR', path.join(dataDir, 'claude')),
  gmPassword: str('GM_PASSWORD', ''),
  sessionSecret: str('SESSION_SECRET', ''),
  playerKey: str('PLAYER_KEY', ''),
  aiMode: str('AI_MODE', process.env.ANTHROPIC_API_KEY ? 'live' : 'mock') as 'live' | 'mock',
  claudeModel: str('CLAUDE_MODEL', 'claude-opus-5-5'),
  aiTimeoutMs: int('AI_TIMEOUT_MS', 120_000),
  clientDist: path.resolve(str('CLIENT_DIST', path.resolve(process.cwd(), '../client/dist'))),
  cookieSecure: str('COOKIE_SECURE', '0') === '1',
};

export function ensureDirs(): void {
  for (const d of [env.dataDir, env.uploadsDir, env.agentCwd, env.claudeConfigDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
