#!/usr/bin/env node
// Stand-in for the Claude Code binary, for tests. It speaks just enough of the CLI's two faces:
//
//  - `claude auth status` / `claude auth login`, the way the GM console's sign-in drives them;
//  - the Agent SDK's stream-json control protocol (initialize, the user turn, in-process MCP tool
//    calls through `mcp_message`, assistant messages, the result, the idle state), so the real
//    `query()` in the SDK runs end to end against it, with the app's MCP servers answering.
//
// What it does on a turn comes from FAKE_CLAUDE_SCENARIO (JSON) or FAKE_CLAUDE_SCENARIO_FILE:
//   { "rules": [{ "when": { "prompt": "regex", "system": "regex", "resume": true }, "do": {...} }], "default": {...} }
// A behaviour ("do") may set:
//   delayMs, hang (after init), hangBeforeInit, exitCode (+ stderr) to crash after the user turn,
//   sessionId, tools: [{ server, name, args }] called in order, text (with {tool0}.. {prompt} {system}),
//   structured (an object, or "planner" / "guesser" to write a valid answer from the prompt),
//   resultSubtype ("success" or an error subtype), errors, costUsd.
// Every invocation appends one JSON line to FAKE_CLAUDE_LOG describing what it was given.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const argv = process.argv.slice(2);
const configDir = process.env.CLAUDE_CONFIG_DIR ?? '.';
const creds = path.join(configDir, '.credentials.json');

function record(entry) {
  const file = process.env.FAKE_CLAUDE_LOG;
  if (!file) return;
  try {
    fs.appendFileSync(file, JSON.stringify({ at: Date.now(), pid: process.pid, ...entry }) + '\n');
  } catch {
    // a test that does not read the log may point it anywhere
  }
}

// ---- auth --------------------------------------------------------------------------------------

if (argv[0] === '--version') {
  process.stdout.write('0.0.0-fake (Claude Code)\n');
  process.exit(0);
}

if (argv[0] === 'auth' && argv[1] === 'status') {
  record({ kind: 'auth_status', configDir });
  process.exit(fs.existsSync(creds) ? 0 : 1);
}

if (argv[0] === 'auth' && argv[1] === 'login') {
  record({ kind: 'auth_login', argv, configDir, hasAmbientKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN) });
  if (process.env.FAKE_LOGIN_NO_URL) {
    process.stderr.write('Login failed: no browser and no link\n');
    process.exit(3);
  }
  process.stdout.write('Opening browser to sign in…\nIf the browser did not open, visit: https://claude.ai/oauth/authorize?code=true&client_id=test&state=abc123\n');
  process.stdout.write('Paste code here if prompted > ');
  const rl = readline.createInterface({ input: process.stdin });
  rl.once('line', (line) => {
    const delay = Number(process.env.FAKE_LOGIN_DELAY_MS ?? 0);
    setTimeout(() => {
      if (line.trim() === 'good-code') {
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(creds, JSON.stringify({ claudeAiOauth: { accessToken: 'fake', refreshToken: 'fake', expiresAt: Date.now() + 3600e3 } }));
        process.stdout.write('Login successful.\n');
        process.exit(0);
      }
      process.stderr.write('Login failed: Invalid authorization code\n');
      process.exit(1);
    }, delay);
  });
} else if (!argv.includes('stream-json') && !argv.includes('--output-format=stream-json')) {
  process.stderr.write('fake claude: unsupported command\n');
  process.exit(1);
} else {
  streamJson();
}

// ---- stream-json -------------------------------------------------------------------------------

function loadScenario() {
  try {
    if (process.env.FAKE_CLAUDE_SCENARIO_FILE) return JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_SCENARIO_FILE, 'utf8'));
    if (process.env.FAKE_CLAUDE_SCENARIO) return JSON.parse(process.env.FAKE_CLAUDE_SCENARIO);
  } catch (e) {
    process.stderr.write(`fake claude: bad scenario: ${e.message}\n`);
    process.exit(2);
  }
  return {};
}

/** `--name=value` or `--name value`, as the SDK writes them. */
function flag(name) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1] ?? '';
    if (argv[i].startsWith(`${name}=`)) return argv[i].slice(name.length + 1);
  }
  return undefined;
}

function pick(scenario, ctx) {
  for (const rule of scenario.rules ?? []) {
    const w = rule.when ?? {};
    if (w.prompt && !new RegExp(w.prompt, 'i').test(ctx.prompt)) continue;
    if (w.system && !new RegExp(w.system, 'i').test(ctx.system)) continue;
    if (w.resume !== undefined && Boolean(ctx.resume) !== w.resume) continue;
    if (w.args && !new RegExp(w.args).test(argv.join(' '))) continue;
    return rule.do ?? {};
  }
  return scenario.default ?? {};
}

/** Distinct made-up words of the key's length, never the key itself. */
function wordsLike(key, n, avoid = []) {
  const taken = new Set([key, ...avoid]);
  const out = [];
  for (let shift = 1; out.length < n && shift < 2000; shift++) {
    const w = key
      .split('')
      .map((c, j) => String.fromCharCode(65 + ((c.charCodeAt(0) - 65 + shift + j * Math.floor(shift / 26)) % 26)))
      .join('');
    if (!taken.has(w)) {
      taken.add(w);
      out.push(w);
    }
  }
  return out;
}

function structuredFor(spec, prompt) {
  if (spec === 'planner') {
    const m = /Key: ([A-Z]+)\..*?exactly (\d+) guesses/s.exec(prompt);
    if (!m) return { guesses: [] };
    return { guesses: [...wordsLike(m[1], Number(m[2]) - 1), m[1]] };
  }
  if (spec === 'guesser') {
    const len = Number(/The key is (\d+) letters/.exec(prompt)?.[1] ?? 5);
    const tried = [...prompt.matchAll(/Guess \d+: ([A-Z]+) ->/g)].map((x) => x[1]);
    return { guess: wordsLike('A'.repeat(len), 1, tried)[0] };
  }
  return spec;
}

function streamJson() {
  const scenario = loadScenario();
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  const pending = new Map();
  let n = 0;
  const ask = (request) =>
    new Promise((resolve) => {
      const id = `fake-${++n}`;
      pending.set(id, resolve);
      out({ type: 'control_request', request_id: id, request });
    });
  let init = null;
  let answered = false;
  const resume = flag('--resume') || null;
  const rl = readline.createInterface({ input: process.stdin });

  rl.on('line', async (line) => {
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    // A CLI stuck before its handshake answers nothing at all, not even the user turn.
    if (scenario.default?.hangBeforeInit) {
      if (m.type === 'user') record({ kind: 'turn', argv, hung: true });
      return;
    }
    if (m.type === 'control_request' && m.request?.subtype === 'initialize') {
      init = m.request;
      out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } });
      return;
    }
    if (m.type === 'control_response') {
      const r = pending.get(m.response?.request_id);
      pending.delete(m.response?.request_id);
      r?.(m.response);
      return;
    }
    if (m.type !== 'user' || answered) return;
    answered = true;
    const content = m.message?.content;
    const prompt = typeof content === 'string' ? content : (content ?? []).map((b) => b.text ?? '').join('\n');
    const system = Array.isArray(init?.systemPrompt) ? init.systemPrompt.join('\n') : String(init?.systemPrompt ?? '');
    const behaviour = pick(scenario, { prompt, system, resume });
    const entry = {
      kind: 'turn',
      argv,
      cwd: process.cwd(),
      resume,
      prompt,
      system,
      jsonSchema: init?.jsonSchema ?? null,
      sdkMcpServers: init?.sdkMcpServers ?? [],
      mcpTools: Object.fromEntries(Object.entries(init?.sdkMcpServerManifests ?? {}).map(([k, v]) => [k, (v.toolsListResult?.tools ?? []).map((t) => t.name)])),
      env: {
        CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
        CLAUDE_AGENT_SDK_CLIENT_APP: process.env.CLAUDE_AGENT_SDK_CLIENT_APP,
      },
      toolResults: [],
    };
    if (behaviour.exitCode !== undefined && behaviour.exitCode !== null) {
      record(entry);
      if (behaviour.stderr) process.stderr.write(behaviour.stderr + '\n');
      process.exit(behaviour.exitCode);
    }
    const sessionId = behaviour.sessionId ?? resume ?? `fake-session-${process.pid}`;
    out({ type: 'system', subtype: 'init', session_id: sessionId, tools: [], mcp_servers: [], model: flag('--model') ?? 'fake', permissionMode: flag('--permission-mode') ?? 'default', apiKeySource: 'none', cwd: process.cwd(), slash_commands: [], output_style: 'default', uuid: `u-init-${process.pid}` });
    if (behaviour.hang) {
      record({ ...entry, hung: true });
      return;
    }
    const results = [];
    for (const [i, t] of (behaviour.tools ?? []).entries()) {
      const server = t.server ?? init?.sdkMcpServers?.[0];
      const r = await ask({ subtype: 'mcp_message', server_name: server, message: { jsonrpc: '2.0', id: 100 + i, method: 'tools/call', params: { name: t.name, arguments: t.args ?? {} } } });
      const res = r?.response?.mcp_response;
      const text = res?.result?.content?.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n') ?? `ERROR ${JSON.stringify(res?.error ?? r)}`;
      results.push(text);
      entry.toolResults.push({ name: t.name, args: t.args ?? {}, text, isError: Boolean(res?.result?.isError) });
      out({ type: 'assistant', message: { id: `m-tool-${i}`, type: 'message', role: 'assistant', model: 'fake', content: [{ type: 'tool_use', id: `tu-${i}`, name: `mcp__${server}__${t.name}`, input: t.args ?? {} }], stop_reason: 'tool_use', usage: {} }, parent_tool_use_id: null, session_id: sessionId, uuid: `u-tool-${i}-${process.pid}` });
    }
    record(entry);
    if (behaviour.delayMs) await new Promise((r) => setTimeout(r, behaviour.delayMs));
    const fill = (s) =>
      String(s ?? '')
        .replace(/\{tool(\d+)\}/g, (_, k) => results[Number(k)] ?? '')
        .replace(/\{prompt\}/g, prompt)
        .replace(/\{system\}/g, system.slice(0, 60));
    const text = fill(behaviour.text ?? 'FAKE REPLY');
    if (text) out({ type: 'assistant', message: { id: 'm-text', type: 'message', role: 'assistant', model: 'fake', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: {} }, parent_tool_use_id: null, session_id: sessionId, uuid: `u-text-${process.pid}` });
    const subtype = behaviour.resultSubtype ?? 'success';
    const base = { type: 'result', subtype, duration_ms: 1, duration_api_ms: 1, num_turns: 1 + results.length, session_id: sessionId, total_cost_usd: behaviour.costUsd ?? 0.001, usage: {}, modelUsage: {}, permission_denials: [], uuid: `u-result-${process.pid}` };
    if (subtype === 'success') out({ ...base, is_error: false, result: text, structured_output: behaviour.structured === undefined ? undefined : structuredFor(behaviour.structured, prompt) });
    else out({ ...base, is_error: true, errors: behaviour.errors ?? [`fake ${subtype}`] });
    out({ type: 'system', subtype: 'session_state_changed', state: 'idle', session_id: sessionId, uuid: `u-idle-${process.pid}` });
  });
  rl.on('close', () => process.exit(0));
  // Keep the process alive while it waits on the SDK.
  setInterval(() => {}, 1 << 30);
}
