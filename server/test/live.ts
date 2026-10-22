// Import this first in a test file that exercises the live AI paths. env.ts reads AI_MODE and the
// credential when it loads, so these have to be in place before anything imports it; the real Agent
// SDK then spawns test/fake-claude.mjs instead of Claude Code, with no network and no account.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.AI_MODE = 'auto';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
process.env.CLAUDE_BINARY = fileURLToPath(new URL('./fake-claude.mjs', import.meta.url));
for (const d of ['agent-cwd', 'uploads', 'claude']) fs.mkdirSync(path.join(process.env.DATA_DIR ?? os.tmpdir(), d), { recursive: true });

export const FAKE_CLAUDE = process.env.CLAUDE_BINARY;

export type Behaviour = {
  delayMs?: number;
  hang?: boolean;
  hangBeforeInit?: boolean;
  exitCode?: number;
  stderr?: string;
  sessionId?: string;
  tools?: { server?: string; name: string; args?: Record<string, unknown> }[];
  text?: string;
  structured?: unknown;
  resultSubtype?: string;
  errors?: string[];
  costUsd?: number;
};
export type Scenario = { rules?: { when: { prompt?: string; system?: string; resume?: boolean; args?: string }; do: Behaviour }[]; default?: Behaviour };

/** What every later call into the fake does, until the next scenario. */
export function scenario(s: Scenario): void {
  process.env.FAKE_CLAUDE_SCENARIO = JSON.stringify(s);
}

export type Turn = {
  kind: 'turn' | 'auth_status' | 'auth_login';
  argv: string[];
  cwd: string;
  resume: string | null;
  prompt: string;
  system: string;
  jsonSchema: unknown;
  sdkMcpServers: string[];
  mcpTools: Record<string, string[]>;
  env: Record<string, string | undefined>;
  toolResults: { name: string; args: Record<string, unknown>; text: string; isError: boolean }[];
  hung?: boolean;
};

/** A fresh call log; returns a reader for the turns recorded since. */
export function callLog(): () => Turn[] {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's30-fake-log-')), 'calls.jsonl');
  process.env.FAKE_CLAUDE_LOG = file;
  return () =>
    fs.existsSync(file)
      ? fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as Turn)
      : [];
}

/** `--name=value` from a recorded argv. */
export function arg(turn: Turn, name: string): string | undefined {
  const hit = turn.argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (hit === undefined) return undefined;
  return hit === name ? (turn.argv[turn.argv.indexOf(hit) + 1] ?? '') : hit.slice(name.length + 1);
}
