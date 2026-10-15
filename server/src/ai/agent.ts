import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { env } from '../env.js';

export function aiLive(): boolean {
  return env.aiMode === 'live' && Boolean(process.env.ANTHROPIC_API_KEY);
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
    },
    maxTurns: o.maxTurns ?? 6,
    effort: o.effort ?? 'medium',
    persistSession: o.persist ?? false,
    abortController: abort,
  };
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
