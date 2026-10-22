import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

// The server as Docker runs it: a process that boots, survives what it should, comes back from a
// kill with the game where it was, and stops cleanly.

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsx = path.join(serverDir, 'node_modules', '.bin', 'tsx');
const procs: ChildProcess[] = [];
const dirs: string[] = [];

const freePort = () =>
  new Promise<number>((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(p));
    });
  });

async function boot(dataDir: string, port: number, extra: Record<string, string> = {}) {
  const log: string[] = [];
  const proc = spawn(tsx, ['src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, CLAUDE_CONFIG_DIR: path.join(dataDir, 'claude'), GM_PASSWORD: 'process-test', AI_MODE: 'mock', SESSION_SECRET: '', PLAYER_KEY: 'jimmy30', CLIENT_DIST: path.join(dataDir, 'no-client'), NODE_OPTIONS: '--disable-warning=ExperimentalWarning', ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.push(proc);
  proc.stdout!.on('data', (d) => log.push(String(d)));
  proc.stderr!.on('data', (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${port}`;
  const exited = new Promise<number | null>((r) => proc.once('exit', (code) => r(code)));
  for (let i = 0; i < 300; i++) {
    if (proc.exitCode !== null) break;
    try {
      if ((await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(500) })).ok) return { proc, base, log, exited };
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { proc, base, log, exited };
}
const json = (base: string, p: string, body: unknown, cookie?: string) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 's30-proc-'));
  dirs.push(d);
  return d;
};

afterEach(() => {
  for (const p of procs.splice(0)) if (p.exitCode === null) p.kill('SIGKILL');
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('the server process', () => {
  it('comes back from a kill -9 mid-race with the game, the GM login and the phone link intact', async () => {
    const dataDir = tmp();
    const port = await freePort();
    const first = await boot(dataDir, port);
    expect(first.log.join('')).toMatch(/listening on :\d+/);
    const gmLogin = await json(first.base, '/api/gm/login', { password: 'process-test' });
    const gm = gmLogin.headers.get('set-cookie')!.split(';')[0];
    const phone = (await fetch(`${first.base}/?k=jimmy30`)).headers.get('set-cookie')!.split(';')[0];
    await json(first.base, '/api/player/start', {}, phone);
    await json(first.base, '/api/gm/stage', { stage: 'hack' }, gm);
    await json(first.base, '/api/player/hack/guess', { word: 'PLANTER' }, phone);
    const before = (await (await fetch(`${first.base}/api/gm/overview`, { headers: { cookie: gm } })).json()) as { state: { stage: string; hack: { secret: string; guesses: string[]; round: number } } };
    expect(before.state.stage).toBe('hack');
    first.proc.kill('SIGKILL');
    await first.exited;

    const second = await boot(dataDir, port);
    const after = await fetch(`${second.base}/api/gm/overview`, { headers: { cookie: gm } });
    expect(after.status, 'the GM login survives without SESSION_SECRET').toBe(200);
    const o = (await after.json()) as typeof before;
    expect(o.state.stage).toBe('hack');
    expect(o.state.hack.secret).toBe(before.state.hack.secret);
    expect(o.state.hack.guesses).toEqual(['PLANTER']);
    expect(o.state.hack.round).toBe(before.state.hack.round);
    const view = await fetch(`${second.base}/api/player/state`, { headers: { cookie: phone } });
    expect(view.status, 'the phone is not turned away after the restart').toBe(200);
    expect(((await view.json()) as { stage: string }).stage).toBe('hack');
  }, 60_000);

  it('survives a WebSocket upgrade carrying a cookie no browser should send', async () => {
    const { base, proc, log } = await boot(tmp(), await freePort());
    for (const cookie of ['progress=100%', 's30p=%E0%A4%A', 'a=%; b=%%; c=%zz']) {
      await new Promise<void>((resolve) => {
        const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?role=player`, { headers: { cookie } });
        ws.once('open', () => (ws.close(), resolve()));
        ws.once('error', () => resolve());
        ws.once('unexpected-response', () => resolve());
      });
    }
    await new Promise((r) => setTimeout(r, 300));
    expect(proc.exitCode, log.join('')).toBeNull();
    expect((await fetch(`${base}/healthz`)).ok).toBe(true);
  }, 60_000);

  it('stops on SIGTERM within seconds, even with phones and consoles connected', async () => {
    const { base, proc, exited } = await boot(tmp(), await freePort(), { PLAYER_KEY: '' });
    const sockets = await Promise.all(
      Array.from({ length: 5 }, () => new Promise<WebSocket>((resolve) => {
        const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?role=player`);
        ws.once('open', () => resolve(ws));
      })),
    );
    const started = Date.now();
    proc.kill('SIGTERM');
    expect(await exited).toBe(0);
    expect(Date.now() - started).toBeLessThan(5000);
    for (const ws of sockets) ws.terminate();
  }, 60_000);

  it('exits instead of idling half-started when the port is taken', async () => {
    const port = await freePort();
    const blocker = net.createServer().listen(port, '127.0.0.1');
    await new Promise((r) => blocker.once('listening', r));
    const { proc, exited } = await boot(tmp(), port);
    expect(await Promise.race([exited, new Promise((r) => setTimeout(() => r('still running'), 15_000))])).toBe(1);
    expect(proc.exitCode).toBe(1);
    blocker.close();
  }, 60_000);
});
