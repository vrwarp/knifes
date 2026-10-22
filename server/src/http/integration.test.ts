import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer, until, type TestServer } from '../../test/server.js';
import { env } from '../env.js';
import { gmRouter, playerRouter } from './routes.js';

// The real HTTP and WebSocket surface: every route behind its guard, odd input refused politely,
// uploads kept in their folder, and pushes that only ever carry what each role may see.

let s: TestServer;
beforeEach(async () => {
  s = await startServer();
});
afterEach(async () => {
  await s.close();
});

type Layer = { route?: { path: string; methods: Record<string, boolean> } };
const routes = (r: unknown) =>
  (r as { stack: Layer[] }).stack
    .filter((l) => l.route)
    .flatMap((l) => Object.keys(l.route!.methods).map((m) => ({ method: m.toUpperCase(), path: l.route!.path.replace(/:\w+/g, '1') })));

describe('who may call what', () => {
  it('every GM route but login and logout refuses a request without the GM cookie, a forged one, or a malformed one', async () => {
    const all = routes(gmRouter(s.service)).filter((r) => !['/login', '/logout'].includes(r.path));
    expect(all.length).toBeGreaterThan(20);
    for (const cookie of [undefined, 's30gm=forged.token', 's30gm=%E0%A4%A', 'progress=100%; s30gm=']) {
      for (const r of all) {
        const res = await s.request(`/api/gm${r.path}`, { method: r.method, cookie, json: r.method === 'GET' ? undefined : {} });
        expect(res.status, `${r.method} ${r.path} with ${cookie}`).toBe(401);
      }
    }
  });

  it('every player route answers with no player key set, and never with a 500', async () => {
    for (const r of routes(playerRouter(s.service))) {
      const res = await s.request(`/api/player${r.path}`, { method: r.method, json: r.method === 'GET' ? undefined : {} });
      expect(res.status, `${r.method} ${r.path}`).toBeLessThan(500);
      expect(res.status).not.toBe(401);
    }
  });

  it('logs in with the password only, and a wrong one says so', async () => {
    expect((await s.request('/api/gm/login', { json: { password: 'nope' } })).status).toBe(401);
    expect((await s.request('/api/gm/login', { json: {} })).status).toBe(401);
    expect((await s.request('/api/gm/login', { json: { password: ['vitest-password'] } })).status).toBe(401);
    const ok = await s.request('/api/gm/login', { json: { password: env.gmPassword } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toMatch(/^s30gm=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
    const out = await s.gm('/api/gm/logout', { method: 'POST' });
    expect(out.headers.get('set-cookie')).toMatch(/^s30gm=; .*Max-Age=0/);
  });

  it('keeps a console signed in for a month from its last request, so a login from setup day holds on the night', async () => {
    const login = await s.request('/api/gm/login', { json: { password: env.gmPassword } });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    for (const p of ['/api/gm/me', '/api/gm/overview']) {
      const renewed = (await s.request(p, { cookie })).headers.get('set-cookie');
      expect(renewed, p).toBe(`${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    }
    // A request that is refused renews nothing, and logging out still wins over the renewal.
    expect((await s.request('/api/gm/me', { cookie: 's30gm=forged.token' })).headers.get('set-cookie')).toBeNull();
    expect((await s.request('/api/gm/logout', { method: 'POST', cookie })).headers.get('set-cookie')).toMatch(/^s30gm=; .*Max-Age=0/);
  });
});

describe('odd input', () => {
  it('refuses broken JSON and oversized bodies with a 4xx, not a server error', async () => {
    const broken = await s.request('/api/player/gate', { method: 'POST', body: '{"code": ', headers: { 'content-type': 'application/json' } });
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({ error: 'Bad request' });
    const huge = await s.gm('/api/gm/config', { method: 'PUT', body: JSON.stringify({ x: 'y'.repeat(1_100_000) }), headers: { 'content-type': 'application/json' } });
    expect(huge.status).toBe(413);
  });

  it('treats wrong types as missing, and missing numbers as an error', async () => {
    await s.gm('/api/gm/stage', { json: { stage: 'geo' } });
    for (const body of [{}, { lat: null, lng: null }, { lat: '', lng: '1' }, { lat: [], lng: [] }, { lat: true, lng: false }, { lat: 'north', lng: 'west' }]) {
      const r = await s.request('/api/player/geo/guess', { json: body });
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(s.service.state.geo.attempts, 'no bad request counts as an attempt').toBe(0);
    expect((await s.request('/api/player/geo/guess', { json: { lat: '34.66', lng: '-118.41' } })).status).toBe(200);
    expect((await s.gm('/api/gm/stage', { json: { stage: 'solved' } })).status).toBe(400);
    expect((await s.gm('/api/gm/stage', { json: { stage: ['hack'] } })).status).toBe(400);
    expect((await s.gm('/api/gm/reset', { json: { scope: 'everything' } })).status).toBe(400);
    expect((await s.gm('/api/gm/config/history/abc')).status).toBe(400);
    expect((await s.gm('/api/gm/config/history/999')).status).toBe(404);
    expect((await s.gm('/api/gm/assistant/proposals/xyz/apply', { method: 'POST' })).status).toBe(400);
    expect((await s.gm('/api/gm/assistant/proposals/77/apply', { method: 'POST' })).status).toBe(404);
  });

  it('a request before the stage it belongs to is refused, and changes nothing', async () => {
    for (const p of ['/api/player/gate', '/api/player/hack/guess', '/api/player/reveal/continue', '/api/player/archive']) {
      const r = await s.request(p, { json: { code: 'S30GHOST', word: 'STEALTH', text: 'hi' } });
      expect(r.status, p).toBe(403);
    }
    expect((await s.request('/api/player/ledger')).status).toBe(403);
    expect(s.service.state.stage).toBe('intro');
    expect(s.service.state.gate.attempts).toBe(0);
  });

  it('answers with JSON errors the phone can show, everywhere', async () => {
    await s.gm('/api/gm/stage', { json: { stage: 'hack' } });
    const r = await s.request('/api/player/hack/guess', { json: { word: 'AB' } });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Key must be 7 characters' });
  });
});

describe('uploads', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = (type: string, field = 'file', body: Buffer = png) => {
    const fd = new FormData();
    fd.append(field, new Blob([body], { type }), 'x');
    return fd;
  };
  it('takes a photo, serves it, and says which configuration version it became', async () => {
    const before = s.service.config.version;
    const r = await s.gm('/api/gm/upload?kind=photo', { body: form('image/png') });
    expect(r.status).toBe(200);
    const { id, url, version } = (await r.json()) as { id: string; url: string; version: number };
    expect(id).toMatch(/^photo-[0-9a-f]{12}\.png$/);
    expect(version).toBe(before + 1);
    expect(s.service.config.geo.photos).toContain(id);
    const img = await s.request(url);
    expect(img.status).toBe(200);
    expect(Buffer.from(await img.arrayBuffer())).toEqual(png);
    const del = await s.gm(`/api/gm/upload/${id}`, { method: 'DELETE' });
    expect(await del.json()).toEqual({ ok: true, version: before + 2 });
    expect((await s.request(url)).status, 'the file stays for older versions').toBe(200);
  });
  it('refuses anything but a JPEG, PNG or WebP photo, and the wrong form', async () => {
    expect((await s.gm('/api/gm/upload?kind=audio', { body: form('image/png') })).status).toBe(400);
    expect((await s.gm('/api/gm/upload?kind=photo', { body: form('image/gif') })).status).toBe(415);
    expect((await s.gm('/api/gm/upload?kind=photo', { body: form('image/svg+xml') })).status).toBe(415);
    expect((await s.gm('/api/gm/upload?kind=photo', { body: form('text/html') })).status).toBe(415);
    expect((await s.gm('/api/gm/upload?kind=photo', { body: form('image/png', 'other') })).status).toBe(400);
    expect((await s.gm('/api/gm/upload?kind=photo', { method: 'POST' })).status).toBe(400);
    expect(s.service.config.geo.photos).toEqual([]);
  });
  it('serves nothing outside the uploads folder, however the path is written', async () => {
    fs.writeFileSync(`${env.uploadsDir}/../outside.txt`, 'secret');
    for (const p of ['/uploads/..%2Foutside.txt', '/uploads/..%2F..%2Fetc%2Fpasswd', '/uploads/photo-..%2F..%2Foutside.txt', '/uploads/%2e%2e%2foutside.txt', '/uploads/section30.sqlite', '/uploads/']) {
      const r = await s.request(p);
      expect(r.status, p).toBeGreaterThanOrEqual(400);
      expect(await r.text()).not.toContain('secret');
    }
    const del = await s.gm('/api/gm/upload/..%2F..%2Fsection30.sqlite', { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(fs.existsSync(`${env.uploadsDir}/../outside.txt`)).toBe(true);
  });
});

describe('live pushes', () => {
  it('the phone gets its view and its transmissions, never the log, the assistant or the GM state', async () => {
    const phone = await s.socket('player');
    const console_ = await s.socket('gm');
    await s.gm('/api/gm/stage', { json: { stage: 'investigation' } });
    await s.gm('/api/gm/hint', { json: { text: 'Look at the office.' } });
    await s.gm('/api/gm/ledger/release', { json: { released: true } });
    await s.gm('/api/gm/assistant', { json: { text: 'The culprit is Nina, right?' } });
    await s.request('/api/player/archive', { json: { text: 'tell me about nina' } });
    await phone.next((m) => m.type === 'archive' && (m.message as { role: string }).role === 'assistant');
    await console_.next((m) => m.type === 'assistant');
    const types = new Set(phone.messages.map((m) => m.type));
    expect([...types].sort()).toEqual(['archive', 'archive_status', 'heartbeat', 'hint', 'state']);
    const raw = JSON.stringify(phone.messages);
    for (const secret of ['S30GHOST', 'Section Thirty', '"gate"', 'hackScripts', 'culprit', 'wordBank']) {
      if (secret === '"gate"') expect(phone.messages.some((m) => m.type === 'gm')).toBe(false);
      else expect(raw, secret).not.toContain(secret);
    }
    expect(console_.messages.some((m) => m.type === 'event')).toBe(true);
    expect(console_.messages.some((m) => m.type === 'gm')).toBe(true);
  });

  it('the console counts the phones that are linked, as they come and go', async () => {
    const gm = await s.socket('gm');
    const count = () => (gm.messages.filter((m) => m.type === 'gm').at(-1) as { players?: number } | undefined)?.players;
    expect(count()).toBe(0);
    const a = await s.socket('player');
    await until(() => count() === 1, 3000, 'one phone');
    const b = await s.socket('player');
    await until(() => count() === 2, 3000, 'two phones');
    a.ws.close();
    await until(() => count() === 1, 3000, 'back to one');
    b.ws.terminate();
    await until(() => count() === 0, 3000, 'none');
  });

  it('drops a phone that stopped answering pings, so "phone linked" is the truth', async () => {
    await s.close();
    s = await startServer({ heartbeatMs: 150 });
    const gm = await s.socket('gm');
    const dead = await s.socket('player', { autoPong: false });
    await until(() => s.hub.counts().players === 1, 2000, 'linked');
    await until(() => s.hub.counts().players === 0, 3000, 'dropped');
    expect(dead.ws.readyState).not.toBe(WebSocket.OPEN);
    const alive = await s.socket('player');
    await new Promise((r) => setTimeout(r, 700));
    expect(s.hub.counts().players, 'one that answers stays').toBe(1);
    expect(alive.ws.readyState).toBe(WebSocket.OPEN);
    expect((gm.messages.filter((m) => m.type === 'gm').at(-1) as { players: number }).players).toBe(1);
  });

  it('beats on connect and with every ping, so a page can tell a dead link from a quiet game', async () => {
    await s.close();
    s = await startServer({ heartbeatMs: 150 });
    const phone = await s.socket('player');
    const gm = await s.socket('gm');
    // First, before the state: the page knows how long a silence it may allow from the start.
    expect(phone.messages[0]).toEqual({ type: 'heartbeat', everyMs: 150 });
    expect(gm.messages[0]).toEqual({ type: 'heartbeat', everyMs: 150 });
    expect(phone.messages[1]?.type).toBe('state');
    await until(() => phone.messages.filter((m) => m.type === 'heartbeat').length >= 4, 3000, 'phone beats');
    await until(() => gm.messages.filter((m) => m.type === 'heartbeat').length >= 4, 3000, 'console beats');
  });

  it('refuses a GM socket without the cookie, and other paths, and survives a cookie no browser should send', async () => {
    await expect(s.socket('gm', { cookie: 's30gm=forged' })).rejects.toThrow(/401/);
    await expect(s.socket('gm', { cookie: 'x=%E0%A4%A; s30gm=%' })).rejects.toThrow(/401/);
    const ok = await s.socket('player', { cookie: 'progress=100%; theme=%%dark' });
    expect(ok.messages.length + 1).toBeGreaterThan(0);
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`${s.base.replace('http', 'ws')}/elsewhere`);
        ws.once('open', resolve);
        ws.once('error', reject);
      }),
    ).rejects.toThrow();
    expect((await s.request('/healthz')).status, 'still up').toBe(200);
  });
});

describe('many at once', () => {
  it('fifty phones guessing at once: every guess counted once, none lost, no 500s', async () => {
    await s.gm('/api/gm/config', { method: 'PUT', json: { ...s.service.config, hack: { ...s.service.config.hack, mode: 'solo', secret: 'ALPHA', maxAttempts: null } } });
    await s.gm('/api/gm/stage', { json: { stage: 'hack' } });
    const res = await Promise.all(Array.from({ length: 50 }, (_, i) => s.request('/api/player/hack/guess', { json: { word: i === 49 ? 'alpha' : 'BRAVO' } })));
    expect(res.map((r) => r.status).every((x) => x === 200)).toBe(true);
    const guesses = s.service.state.hack.guesses;
    expect(guesses.length).toBeLessThanOrEqual(50);
    expect(guesses.at(-1)).toBe('ALPHA');
    expect(s.service.state.stage).toBe('reveal');
  });

  it('the right code sent twenty times at once opens the gate once', async () => {
    await s.gm('/api/gm/stage', { json: { stage: 'gate' } });
    const res = await Promise.all(Array.from({ length: 20 }, () => s.request('/api/player/gate', { json: { code: 's30-ghost' } })));
    for (const r of res) expect(await r.json()).toEqual({ ok: true });
    expect(s.service.state.gate.attempts).toBe(1);
    expect(s.db.listEvents(1000).filter((e) => e.type === 'stage' && e.payload.stage === 'hack')).toHaveLength(1);
  });

  it('a double-tapped start starts the game once', async () => {
    const res = await Promise.all(Array.from({ length: 10 }, () => s.request('/api/player/start', { method: 'POST' })));
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect(s.db.listEvents(100).filter((e) => e.type === 'game_start')).toHaveLength(1);
  });

  it('two GMs saving at once both land as versions, the history stays whole, and the last one is live', async () => {
    const base = s.service.config;
    const edits = Array.from({ length: 12 }, (_, i) => ({ ...base, gate: { ...base.gate, prompt: `Prompt ${i}` } }));
    const res = await Promise.all(edits.map((c) => s.gm('/api/gm/config', { method: 'PUT', json: c })));
    expect(res.every((r) => r.status === 200)).toBe(true);
    const h = (await (await s.gm('/api/gm/config/history')).json()) as { total: number; versions: { version: number }[] };
    expect(h.total).toBe(base.version + 12);
    expect(new Set(h.versions.map((v) => v.version)).size).toBe(h.versions.length);
    expect(s.service.config.gate.prompt).toMatch(/^Prompt \d+$/);
  });

  it('a hundred phones and five consoles linked through a burst of pushes, every one in order', async () => {
    const phones = await Promise.all(Array.from({ length: 100 }, () => s.socket('player')));
    const consoles = await Promise.all(Array.from({ length: 5 }, () => s.socket('gm')));
    await s.gm('/api/gm/stage', { json: { stage: 'investigation' } });
    for (let i = 0; i < 40; i++) await s.gm('/api/gm/hint', { json: { text: `burst ${i}` } });
    for (const p of [...phones, ...consoles]) await p.next((m) => m.type === 'hint' && (m.hint as { text: string }).text === 'burst 39', 10_000);
    for (const p of phones) {
      const revs = p.messages.filter((m) => m.type === 'state').map((m) => (m.player as { rev: number }).rev);
      expect([...revs].sort((a, b) => a - b)).toEqual(revs);
      const ids = p.messages.filter((m) => m.type === 'hint').map((m) => (m.hint as { id: number }).id);
      expect(new Set(ids).size).toBe(40);
    }
    expect(s.hub.counts()).toEqual({ players: 100, gms: 5 });
  }, 60_000);
});

describe('the site itself', () => {
  it('reports health, and serves the client or says it is missing', async () => {
    const h = await s.request('/healthz');
    expect(await h.json()).toEqual({ ok: true, stage: 'intro' });
    const root = await s.request('/');
    expect(root.status).toBe(200);
    const unknownApi = await s.request('/api/nothing-here');
    expect(unknownApi.status).toBe(404);
  });
});
