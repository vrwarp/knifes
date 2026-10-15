import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { detectCredential, env } from '../env.js';

export const CLIENT_APP = 'section30/0.1.0';

/** Live whenever mock mode is not forced and Claude Code can find a credential right now. */
export function aiLive(): boolean {
  return env.aiMode !== 'mock' && detectCredential() !== 'none';
}

/**
 * The Claude Code binary the SDK ships in a per-platform optional package.
 * Resolved explicitly so the same file serves the SDK, the auth probe, and
 * `claude auth login` inside the container.
 */
export function findClaudeBinary(): string | null {
  const require = createRequire(import.meta.url);
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const candidates =
    process.platform === 'darwin'
      ? [`darwin-${arch}`]
      : process.platform === 'win32'
        ? [`win32-${arch}`]
        : [`linux-${arch}`, `linux-${arch}-musl`];
  for (const platform of candidates) {
    try {
      const manifest = require.resolve(`@anthropic-ai/claude-agent-sdk-${platform}/package.json`);
      return path.join(path.dirname(manifest), process.platform === 'win32' ? 'claude.exe' : 'claude');
    } catch {
      continue;
    }
  }
  return null;
}

export type AuthState = 'ok' | 'needs_login' | 'unknown';
let authCache: { at: number; state: AuthState } | null = null;

/** Whether Claude Code has a usable credential. Spawns `claude auth status` for a login file, so cached for a minute. */
export async function probeAuth(force = false): Promise<AuthState> {
  if (!force && authCache && Date.now() - authCache.at < 60_000) return authCache.state;
  const source = detectCredential();
  let state: AuthState;
  if (source === 'none') state = 'needs_login';
  else if (source !== 'login') state = 'ok';
  else {
    const binary = findClaudeBinary();
    if (!binary) state = 'unknown';
    else {
      state = await new Promise<AuthState>((resolve) => {
        execFile(
          binary,
          ['auth', 'status'],
          { timeout: 15_000, env: { ...process.env, CLAUDE_CONFIG_DIR: env.claudeConfigDir } },
          (err) => {
            if (!err) return resolve('ok');
            const code = (err as { code?: number | string }).code;
            if (code === 1) return resolve('needs_login');
            console.error('[section30] claude auth status failed', code, err.message);
            resolve('unknown');
          },
        );
      });
    }
  }
  authCache = { at: Date.now(), state };
  return state;
}

export function peekAuth(): AuthState | null {
  return authCache?.state ?? null;
}

export interface ToolCall {
  name: string;
  input: unknown;
}

export interface RunResult {
  text: string;
  structured: unknown;
  sessionId: string | null;
  costUsd: number | null;
  toolCalls: ToolCall[];
}

export interface RunOpts {
  prompt: string;
  systemPrompt: string;
  mcpServers?: Options['mcpServers'];
  allowedTools?: string[];
  resume?: string | null;
  persist?: boolean;
  maxTurns?: number;
  effort?: 'low' | 'medium' | 'high';
  outputFormat?: Options['outputFormat'];
  timeoutMs?: number;
  onAssistantText?: (text: string) => void;
  onToolUse?: (call: ToolCall) => void;
}

export class AgentError extends Error {
  constructor(
    message: string,
    readonly subtype: string,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

/**
 * One call into the Claude Agent SDK. Every built-in tool is removed; only the
 * in-process MCP tools passed in are reachable, and nothing outside DATA_DIR is touched.
 * Authentication is whatever Claude Code finds: the subscription token, a login
 * in CLAUDE_CONFIG_DIR, or an API key.
 */
export async function runAgent(o: RunOpts): Promise<RunResult> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), o.timeoutMs ?? env.aiTimeoutMs);

  const options: Options = {
    model: env.claudeModel,
    systemPrompt: o.systemPrompt,
    tools: [],
    mcpServers: o.mcpServers ?? {},
    allowedTools: o.allowedTools ?? [],
    permissionMode: 'dontAsk',
    settingSources: [],
    cwd: env.agentCwd,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: env.claudeConfigDir,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_AGENT_SDK_CLIENT_APP: CLIENT_APP,
    },
    maxTurns: o.maxTurns ?? 6,
    effort: o.effort ?? 'medium',
    persistSession: o.persist ?? false,
    abortController: abort,
  };
  const binary = findClaudeBinary();
  if (binary) options.pathToClaudeCodeExecutable = binary;
  if (o.resume) options.resume = o.resume;
  if (o.outputFormat) options.outputFormat = o.outputFormat;

  const result: RunResult = { text: '', structured: undefined, sessionId: null, costUsd: null, toolCalls: [] };
  try {
    for await (const m of query({ prompt: o.prompt, options })) {
      if (m.type === 'system' && m.subtype === 'init') {
        result.sessionId = m.session_id;
      } else if (m.type === 'assistant') {
        for (const block of m.message.content) {
          if (block.type === 'text') {
            o.onAssistantText?.(block.text);
          } else if (block.type === 'tool_use') {
            const call = { name: block.name, input: block.input };
            result.toolCalls.push(call);
            o.onToolUse?.(call);
          }
        }
      } else if (m.type === 'result') {
        result.sessionId = m.session_id;
        result.costUsd = m.total_cost_usd ?? null;
        if (m.subtype === 'success') {
          result.text = m.result;
          result.structured = m.structured_output;
        } else {
          throw new AgentError(`agent run ended with ${m.subtype}: ${(m.errors ?? []).join('; ')}`, m.subtype);
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return result;
}
