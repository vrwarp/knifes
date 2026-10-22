import { vi } from 'vitest';

// A server started with PLAYER_KEY: only a browser that once opened the QR link may play.
vi.hoisted(() => {
  process.env.PLAYER_KEY = 'jimmy30';
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type TestServer } from '../../test/server.js';

let s: TestServer;
beforeEach(async () => {
  s = await startServer();
});
afterEach(async () => {
  await s.close();
});

describe('the player key', () => {
  it('refuses the game without the link, and the QR link sets a cookie that keeps working', async () => {
    expect((await s.request('/api/player/state')).status).toBe(401);
    expect(await (await s.request('/api/player/state')).json()).toEqual({ error: 'This terminal requires the recovery link' });
    const wrong = await s.request('/?k=jimmy31');
    expect(wrong.headers.get('set-cookie')).toBeNull();
    for (const bad of ['', 'JIMMY30', 'jimmy30 ', 'jimmy3', 'jimmy300', '%00']) expect((await s.request(`/api/player/state?k=${encodeURIComponent(bad)}`)).status, bad).toBe(401);
    const qr = await s.request('/?k=jimmy30');
    const cookie = qr.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^s30p=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=1209600/);
    const jar = cookie.split(';')[0];
    expect((await s.request('/api/player/state', { cookie: jar })).status).toBe(200);
    expect((await s.request('/api/player/start', { method: 'POST', cookie: jar })).status).toBe(200);
  });
  it('lets the very request that carries the key through, so a fetch with ?k works on its own', async () => {
    expect((await s.request('/api/player/state?k=jimmy30')).status).toBe(200);
  });
  it('guards the phone socket the same way', async () => {
    await expect(s.socket('player')).rejects.toThrow(/401/);
    const jar = (await s.request('/?k=jimmy30')).headers.get('set-cookie')!.split(';')[0];
    const ok = await s.socket('player', { cookie: jar });
    await ok.next((m) => m.type === 'state');
  });
  it('never asks a GM for it', async () => {
    expect((await s.gm('/api/gm/overview')).status).toBe(200);
    await (await s.socket('gm')).next((m) => m.type === 'gm');
  });
});
