import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GM_PASSWORD = 'test';
// 1x1 transparent PNG: map tiles are stubbed so tests never depend on OpenStreetMap.
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export type Json = Record<string, any>;
export type Server = {
  base: string;
  gmCookie: string;
  gmApi: (p: string, init?: { method?: string; json?: unknown; body?: BodyInit }) => Promise<Response>;
  config: () => Promise<Json>;
  patch: (fn: (c: Json) => void) => Promise<void>;
  setStage: (stage: string) => Promise<void>;
  resetGame: () => Promise<void>;
  restoreDefaults: () => Promise<void>;
  log: string[];
};

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

async function startServer(extraEnv: Record<string, string>): Promise<{ server: Server; proc: ChildProcess; dataDir: string }> {
  const dist = path.join(root, 'server', 'dist', 'index.js');
  if (!fs.existsSync(dist) || !fs.existsSync(path.join(root, 'client', 'dist', 'index.html'))) {
    throw new Error('Build first: npm run build in server/ and client/');
  }
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-e2e-'));
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', dist], {
    cwd: path.join(root, 'server'),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, GM_PASSWORD, AI_MODE: 'mock', CLIENT_DIST: path.join(root, 'client', 'dist'), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log: string[] = [];
  proc.stdout!.on('data', (d) => log.push(String(d)));
  proc.stderr!.on('data', (d) => log.push(String(d)));
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const login = await fetch(`${baseUrl}/api/gm/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: GM_PASSWORD }) });
  if (!login.ok) throw new Error(`GM login failed: ${login.status}\n${log.join('')}`);
  const gmCookie = login.headers.get('set-cookie')!.split(';')[0];
  const gmApi: Server['gmApi'] = (p, init = {}) =>
    fetch(`${baseUrl}${p}`, {
      method: init.method ?? (init.json !== undefined || init.body ? 'POST' : 'GET'),
      headers: { cookie: gmCookie, ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const config = async () => (await (await gmApi('/api/gm/overview')).json()).config as Json;
  const defaults = await config();
  const put = async (c: Json) => {
    const r = await gmApi('/api/gm/config', { method: 'PUT', json: c });
    if (!r.ok) throw new Error(`config ${r.status}: ${await r.text()}`);
  };
  const server: Server = {
    base: baseUrl,
    gmCookie,
    gmApi,
    config,
    log,
    patch: async (fn) => {
      const c = await config();
      fn(c);
      await put(c);
    },
    setStage: async (stage) => {
      const r = await gmApi('/api/gm/stage', { json: { stage } });
      if (!r.ok) throw new Error(`stage ${r.status}: ${await r.text()}`);
    },
    resetGame: async () => {
      await gmApi('/api/gm/reset', { json: { scope: 'game' } });
      // Fresh assistant chat, and no proposals left pending from an earlier test.
      await gmApi('/api/gm/assistant/reset', { method: 'POST' });
      const view = (await (await gmApi('/api/gm/assistant')).json()) as { proposals?: { id: number; status: string }[] };
      for (const p of view.proposals ?? []) if (p.status === 'pending') await gmApi(`/api/gm/assistant/proposals/${p.id}/dismiss`, { method: 'POST' });
    },
    restoreDefaults: async () => put(structuredClone(defaults)),
  };
  return { server, proc, dataDir };
}

type WorkerFixtures = { serverEnv: Record<string, string>; server: Server };
type TestFixtures = { app: Server; player: Page; gm: Page; gmContext: BrowserContext };

/** Context options matching the current project (phone or desktop, Chromium or WebKit). */
export function deviceOptions(testInfo: TestInfo) {
  const u = testInfo.project.use;
  return { viewport: u.viewport, userAgent: u.userAgent, deviceScaleFactor: u.deviceScaleFactor, isMobile: u.isMobile, hasTouch: u.hasTouch };
}

async function stubTiles(context: BrowserContext) {
  await context.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TILE }));
}

export async function newGmPage(browser: Browser, server: Server, testInfo: TestInfo): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(deviceOptions(testInfo));
  await stubTiles(context);
  const [name, value] = server.gmCookie.split('=');
  await context.addCookies([{ name, value, url: server.base }]);
  const page = await context.newPage();
  return { context, page };
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  serverEnv: [{}, { scope: 'worker', option: true }],
  server: [
    async ({ serverEnv }, use) => {
      const { server, proc, dataDir } = await startServer(serverEnv);
      await use(server);
      proc.kill('SIGTERM');
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
  // Every test starts from a fresh game and the default configuration.
  app: async ({ server }, use, testInfo) => {
    await server.restoreDefaults();
    await server.resetGame();
    await use(server);
    if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach('server-log', { body: server.log.join(''), contentType: 'text/plain' });
  },
  context: async ({ context }, use) => {
    await stubTiles(context);
    await use(context);
  },
  player: async ({ page, app }, use) => {
    void app;
    await use(page);
  },
  gmContext: async ({ browser, app }, use, testInfo) => {
    const { context } = await newGmPage(browser, app, testInfo);
    await use(context);
    await context.close();
  },
  gm: async ({ gmContext, app }, use) => {
    const page = gmContext.pages()[0] ?? (await gmContext.newPage());
    await page.goto(`${app.base}/gm`);
    await expect(page.getByText('GM console').first()).toBeVisible();
    await use(page);
  },
});
export { expect };

// ---- player helpers --------------------------------------------------------------------------

/** Typewriter text gates the next button; tapping the text finishes it. */
export async function finishTyping(page: Page) {
  for (const el of await page.locator('.typed-stack').all()) {
    try {
      await el.click({ timeout: 1000 });
    } catch {}
  }
}

export async function startGame(page: Page, base: string) {
  await page.goto(base);
  const start = page.getByRole('button', { name: /initiate recovery protocol/i });
  await expect(start).toBeVisible();
  await finishTyping(page);
  await expect(start).toBeEnabled();
  await start.click();
}

export async function fillDeduction(page: Page, answers: Record<string, string>) {
  for (const [label, value] of Object.entries(answers)) await page.getByLabel(label, { exact: true }).fill(value);
}

export const RIGHT_ANSWERS = {
  TIME: '3:45 am',
  SUSPECT: 'Agent Vector',
  METHOD: 'poisoned tea',
  ASSET: 'the ledger',
  MOTIVE: 'to sell it',
  'PHYSICAL PROP': 'birthday card envelope',
};

/** The verdict plays in beats separated by CONTINUE. */
export async function finishBeats(page: Page) {
  await expect(page.locator('h1', { hasText: 'DEDUCTION VERIFIED' }).first()).toBeVisible({ timeout: 15_000 });
  const next = page.getByRole('button', { name: /^continue$/i });
  for (let i = 0; i < 8; i++) {
    await finishTyping(page);
    if (!(await next.count())) break;
    await expect(next).toBeEnabled();
    await next.click();
  }
  await finishTyping(page);
}

/** The config editor collapses while a game runs; open it, then the named section. Returns the section. */
export async function configSection(gm: Page, name: string) {
  const collapsed = gm.locator('summary', { hasText: 'Game configuration (collapsed' });
  if (await collapsed.count()) {
    const details = gm.locator('details', { has: collapsed });
    if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await collapsed.click();
  }
  const section = gm.locator(`details.section:has(> summary:has-text(${JSON.stringify(name)}))`).first();
  if (!(await section.evaluate((d) => (d as HTMLDetailsElement).open))) await section.locator('> summary').click();
  return section;
}

export async function noHorizontalScroll(page: Page) {
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(scroll, 'page scrolls sideways').toBeLessThanOrEqual(client + 1);
}

/** Accepts every confirm and answers prompts; returns the messages seen. */
export function acceptDialogs(page: Page, promptAnswer = '') {
  const seen: string[] = [];
  page.on('dialog', async (d) => {
    seen.push(d.message());
    if (d.type() === 'prompt') await d.accept(promptAnswer);
    else await d.accept();
  });
  return seen;
}
