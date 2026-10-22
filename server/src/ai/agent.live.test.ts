import { arg, callLog, scenario } from '../../test/live.js';
import fs from 'node:fs';
import path from 'node:path';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { env } from '../env.js';
import { AgentError, aiLive, findClaudeBinary, probeAuth, runAgent } from './agent.js';

// The real Agent SDK against test/fake-claude.mjs: every option the app relies on, every way a run ends.

const echoServer = () =>
  createSdkMcpServer({
    name: 'probe',
    version: '1.0.0',
    alwaysLoad: true,
    tools: [tool('echo', 'Echo the input', { say: z.string() }, async ({ say }) => ({ content: [{ type: 'text', text: `ECHO:${say}` }] }))],
  });

describe('runAgent against the SDK and a stand-in CLI', () => {
  it('is live with a credential in the environment and uses the stand-in binary', async () => {
    expect(aiLive()).toBe(true);
    expect(findClaudeBinary()).toMatch(/fake-claude\.mjs$/);
    expect(await probeAuth(true)).toBe('ok');
  });

  it('returns the text, the session, the cost and every tool call, with the app MCP server answering', async () => {
    const log = callLog();
    scenario({ default: { sessionId: 'sess-abc', costUsd: 0.042, tools: [{ name: 'echo', args: { say: 'hi' } }], text: 'heard {tool0}' } });
    const seen: string[] = [];
    const r = await runAgent({ prompt: 'question?', systemPrompt: 'SYSTEM-RULES', mcpServers: { probe: echoServer() }, allowedTools: ['mcp__probe__*'], onToolUse: (c) => seen.push(c.name) });
    expect(r.text).toBe('heard ECHO:hi');
    expect(r.sessionId).toBe('sess-abc');
    expect(r.costUsd).toBe(0.042);
    expect(r.toolCalls).toEqual([{ name: 'mcp__probe__echo', input: { say: 'hi' } }]);
    expect(seen).toEqual(['mcp__probe__echo']);
    const [turn] = log();
    expect(turn.prompt).toBe('question?');
    expect(turn.system).toBe('SYSTEM-RULES');
    expect(turn.mcpTools).toEqual({ probe: ['echo'] });
    expect(turn.toolResults[0]).toMatchObject({ name: 'echo', text: 'ECHO:hi', isError: false });
  });

  it('removes every built-in tool, ignores settings files, never prompts, and keeps to the data directory', async () => {
    const log = callLog();
    scenario({ default: { text: 'ok' } });
    await runAgent({ prompt: 'p', systemPrompt: 's', allowedTools: ['mcp__x__*'], maxTurns: 3, effort: 'low' });
    const [turn] = log();
    expect(arg(turn, '--tools')).toBe('');
    expect(arg(turn, '--setting-sources')).toBe('');
    expect(arg(turn, '--permission-mode')).toBe('dontAsk');
    expect(arg(turn, '--allowedTools')).toBe('mcp__x__*');
    expect(arg(turn, '--max-turns')).toBe('3');
    expect(arg(turn, '--effort')).toBe('low');
    expect(arg(turn, '--model')).toBe(env.claudeModel);
    expect(turn.argv).toContain('--no-session-persistence');
    expect(turn.argv.some((a) => a.startsWith('--resume'))).toBe(false);
    expect(fs.realpathSync(turn.cwd)).toBe(fs.realpathSync(env.agentCwd));
    expect(path.resolve(turn.env.CLAUDE_CONFIG_DIR!)).toBe(path.resolve(env.claudeConfigDir));
    expect(turn.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    expect(turn.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
    expect(turn.env.CLAUDE_AGENT_SDK_CLIENT_APP).toMatch(/^section30\//);
  });

  it('passes the model override, resume, persistence, the output schema and the thinking setting', async () => {
    const log = callLog();
    scenario({ default: { text: '', structured: { hint: 'x', rationale: 'y' } } });
    const schema = { type: 'object', properties: { hint: { type: 'string' } }, required: ['hint'] };
    const r = await runAgent({ prompt: 'p', systemPrompt: 's', model: 'claude-sonnet-5-5', resume: 'sess-old', persist: true, outputFormat: { type: 'json_schema', schema }, thinking: { type: 'disabled' } });
    expect(r.structured).toEqual({ hint: 'x', rationale: 'y' });
    const [turn] = log();
    expect(arg(turn, '--model')).toBe('claude-sonnet-5-5');
    expect(arg(turn, '--resume')).toBe('sess-old');
    expect(turn.argv).not.toContain('--no-session-persistence');
    expect(JSON.parse(arg(turn, '--json-schema')!)).toEqual(schema);
    expect(turn.argv).toContain('--thinking=disabled');
  });

  it('turns an error result into an AgentError that keeps the subtype', async () => {
    scenario({ default: { resultSubtype: 'error_max_turns', errors: ['too many turns'] } });
    const err = await runAgent({ prompt: 'p', systemPrompt: 's' }).catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect((err as AgentError).subtype).toBe('error_max_turns');
    expect((err as Error).message).toMatch(/too many turns/);
  });

  it('rejects when the CLI crashes, with its stderr in the message', async () => {
    scenario({ default: { exitCode: 1, stderr: 'Invalid API key · Please run /login' } });
    const err = await runAgent({ prompt: 'p', systemPrompt: 's' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toMatch(/exited with code 1|Invalid API key/);
  });

  it.each([
    ['after it started', { hang: true }],
    ['before it even initialised', { hangBeforeInit: true }],
  ])('gives up on a CLI that hangs %s, so no caller waits forever', async (_label, behaviour) => {
    scenario({ default: behaviour });
    const started = Date.now();
    const err = await runAgent({ prompt: 'p', systemPrompt: 's', timeoutMs: 1500 }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(1400);
    expect(took).toBeLessThan(9000);
  });

  it('leaves no stand-in process behind after a timeout', async () => {
    const log = callLog();
    scenario({ default: { hang: true } });
    await runAgent({ prompt: 'p', systemPrompt: 's', timeoutMs: 1000 }).catch(() => undefined);
    const [turn] = log();
    expect(turn.hung).toBe(true);
    const pid = (log()[0] as unknown as { pid: number }).pid;
    await expect.poll(() => {
      try {
        process.kill(pid, 0);
        return 'alive';
      } catch {
        return 'gone';
      }
    }, { timeout: 8000 }).toBe('gone');
  });
});
