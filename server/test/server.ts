// The real server (Express app, WebSocket hub, service, database) on a free port in this process.
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Db } from '../src/db.js';
import { env } from '../src/env.js';
import { createApp } from '../src/http/app.js';
import { Hub } from '../src/http/ws.js';
import { GameService } from '../src/service.js';

export type TestServer = Awaited<ReturnType<typeof startServer>>;

export async function startServer(opts: { heartbeatMs?: number; dir?: string } = {}) {
  const dir = opts.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 's30-http-'));
  const db = new Db(path.join(dir, 't.sqlite'));
  const service = new GameService(db);
  const server = http.createServer(createApp(service));
  const hub = new Hub(service, opts.heartbeatMs);
  hub.attach(server);
  const sockets = new Set<import('node:net').Socket>();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await fetch(`${base}/api/gm/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: env.gmPassword }) });
  const gmCookie = login.headers.get('set-cookie')!.split(';')[0];
  const clients = new Set<WebSocket>();

  const request = (p: string, init: { method?: string; json?: unknown; body?: BodyInit; cookie?: string; headers?: Record<string, string> } = {}) =>
    fetch(`${base}${p}`, {
      method: init.method ?? (init.json !== undefined || init.body ? 'POST' : 'GET'),
      headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...init.headers },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const gm = (p: string, init: Parameters<typeof request>[1] = {}) => request(p, { ...init, cookie: init.cookie ?? gmCookie });

  /** A WebSocket client that keeps every message it receives. */
  const socket = (role: 'player' | 'gm', options: { cookie?: string; autoPong?: boolean } = {}) =>
    new Promise<{ ws: WebSocket; messages: Record<string, unknown>[]; next: (pred: (m: Record<string, unknown>) => boolean, timeoutMs?: number) => Promise<Record<string, unknown>> }>((resolve, reject) => {
      const cookie = options.cookie ?? (role === 'gm' ? gmCookie : undefined);
      const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?role=${role}`, { headers: cookie ? { cookie } : {}, autoPong: options.autoPong ?? true });
      clients.add(ws);
      const messages: Record<string, unknown>[] = [];
      const waiters: { pred: (m: Record<string, unknown>) => boolean; done: (m: Record<string, unknown>) => void }[] = [];
      ws.on('message', (d) => {
        const m = JSON.parse(String(d)) as Record<string, unknown>;
        messages.push(m);
        for (const w of [...waiters]) if (w.pred(m)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.done(m);
        }
      });
      const next = (pred: (m: Record<string, unknown>) => boolean, timeoutMs = 5000) =>
        new Promise<Record<string, unknown>>((res, rej) => {
          const seen = messages.find(pred);
          if (seen) return res(seen);
          const t = setTimeout(() => rej(new Error('no such message')), timeoutMs);
          waiters.push({ pred, done: (m) => (clearTimeout(t), res(m)) });
        });
      ws.once('open', () => resolve({ ws, messages, next }));
      ws.once('unexpected-response', (_req, res) => reject(new Error(`upgrade refused: ${res.statusCode}`)));
      ws.once('error', reject);
    });

  const close = async () => {
    for (const c of clients) c.terminate();
    service.close();
    for (const s of sockets) s.destroy();
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
    if (!opts.dir) fs.rmSync(dir, { recursive: true, force: true });
  };
  return { base, dir, db, service, hub, server, gmCookie, request, gm, socket, close };
}

export const until = async (fn: () => boolean | Promise<boolean>, timeoutMs = 5000, label = 'condition') => {
  const end = Date.now() + timeoutMs;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};
