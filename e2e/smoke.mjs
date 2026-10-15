// End-to-end smoke test: boots the server in mock mode and drives the full game
// through the real HTTP and WebSocket paths with a phone-sized browser.
// Usage: node smoke.mjs   (expects ../client/dist and ../server/dist to be built)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
import net from 'node:net';
const port = Number(process.env.SMOKE_PORT) || (await new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
}));
const base = `http://127.0.0.1:${port}`;
const out = path.join(here, 'output');
fs.mkdirSync(out, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-smoke-'));

const server = spawn('node', ['--disable-warning=ExperimentalWarning', 'dist/index.js'], {
  cwd: path.join(root, 'server'),
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, GM_PASSWORD: 'test', AI_MODE: 'mock', CLIENT_DIST: path.join(root, 'client', 'dist') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(String(d)));
server.stderr.on('data', (d) => serverLog.push(String(d)));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start:\n' + serverLog.join(''));
}

let failures = 0;
let n = 0;
async function step(name, fn) {
  n++;
  try {
    await fn();
    console.log(`ok   ${n}. ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${n}. ${name}\n     ${err.message.split('\n')[0]}`);
  }
}

// Use a preinstalled Chromium when the Playwright package's own download is absent.
const candidates = [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium'].filter(Boolean);
let executablePath;
for (const c of candidates) {
  try {
    const st = fs.statSync(c);
    if (st.isFile()) { executablePath = c; break; }
    if (st.isDirectory()) {
      const found = fs.readdirSync(c, { recursive: true }).map(String).find((f) => /(^|\/)chrome$/.test(f));
      if (found) { executablePath = path.join(c, found); break; }
    }
  } catch {}
}
process.on('exit', () => server.kill('SIGTERM'));
let browser;
try {
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  await waitForServer();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const player = await phone.newPage();
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const gm = await desk.newPage();
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });

  await step('player sees the intro', async () => {
    await player.goto(base);
    await player.getByText('SECTION 30 // MAGENTA CHANNEL').waitFor();
    await shot(player, '01-intro');
    await player.getByRole('button', { name: /initiate recovery protocol/i }).click();
  });

  await step('geo puzzle accepts a pin (no target configured)', async () => {
    await player.locator('h1', { hasText: 'Field transmission' }).waitFor();
    const map = player.locator('.map');
    await map.waitFor();
    await map.click({ position: { x: 150, y: 150 } });
    await player.getByRole('button', { name: /triangulate/i }).click();
    await player.getByText('LOCATION CONFIRMED').waitFor();
    await shot(player, '02-geo');
    await player.getByRole('button', { name: /proceed/i }).click();
  });

  await step('gate rejects a wrong code and accepts MAGENTA30', async () => {
    await player.locator('h1', { hasText: 'Remote asset' }).waitFor();
    const box = player.getByLabel('Recovery key');
    await box.fill('WRONG');
    await player.getByRole('button', { name: /submit key/i }).click();
    await player.getByText('KEY REJECTED').waitFor();
    await box.fill('magenta-30');
    await player.getByRole('button', { name: /submit key/i }).click();
    await player.locator('h1', { hasText: 'Mirror partition' }).waitFor({ timeout: 10_000 });
  });

  await step('word puzzle scores APPLE then solves with ALPHA', async () => {
    const box = player.getByLabel('Key attempt');
    await box.fill('apple');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await player.locator('.tile.near').first().waitFor();
    await shot(player, '03-hack');
    await box.fill('alpha');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await player.locator('h1', { hasText: 'PARTITION DECRYPTED' }).waitFor({ timeout: 10_000 });
    await shot(player, '04-reveal');
    await player.getByRole('button', { name: /return to base/i }).click();
  });

  await step('evidence vault lists the access log', async () => {
    await player.getByRole('tab', { name: 'evidence' }).waitFor();
    await player.getByText('03:42').first().waitFor();
    await shot(player, '05-evidence');
  });

  await step('ARCHIVE answers an office-log question (mock)', async () => {
    await player.getByRole('tab', { name: 'archive' }).click();
    await player.getByLabel('Query').fill('who was in the office at 03:45');
    await player.getByRole('button', { name: /send/i }).click();
    await player.locator('.msg.assistant', { hasText: 'Vector' }).waitFor({ timeout: 10_000 });
    await shot(player, '06-archive');
  });

  await step('GM logs in and sees live state', async () => {
    await gm.goto(`${base}/gm`);
    await gm.getByLabel('Password').fill('test');
    await gm.getByRole('button', { name: /enter/i }).click();
    await gm.getByText('GM console').waitFor();
    await gm.locator('.chip.now', { hasText: 'investigation' }).waitFor({ timeout: 10_000 });
    await gm.locator('.log .ev', { hasText: 'archive_user' }).first().waitFor();
    await shot(gm, '07-gm');
  });

  await step('GM pushes a hint and the player sees the transmission', async () => {
    await gm.getByPlaceholder('Incoming transmission text').fill('Transmission note: count back thirty minutes.');
    await gm.getByRole('button', { name: /push to player/i }).click();
    await player.locator('h1', { hasText: 'Incoming transmission' }).waitFor({ timeout: 10_000 });
    await shot(player, '08-hint');
    await player.getByRole('button', { name: /acknowledge/i }).click();
  });

  await step('deduction rejects a wrong suspect and verifies the right answers', async () => {
    await player.getByRole('tab', { name: 'deduction' }).click();
    const fill = async (answers) => {
      for (const [label, value] of Object.entries(answers)) await player.getByLabel(label, { exact: true }).fill(value);
    };
    await fill({ TIME: '3:45 am', SUSPECT: 'Agent Cipher', METHOD: 'poisoned tea', ASSET: 'the ledger', MOTIVE: 'to sell it', 'PHYSICAL PROP': 'birthday card envelope' });
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await player.getByText('DEDUCTION REJECTED').waitFor({ timeout: 15_000 });
    await fill({ SUSPECT: 'Agent Vector' });
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await player.getByText('DEDUCTION VERIFIED').first().waitFor({ timeout: 15_000 });
    await shot(player, '09-solved');
  });

  await step('GM generates and publishes the case report (mock)', async () => {
    await gm.getByRole('button', { name: /generate with ai/i }).click();
    await gm.getByText('Report generated').waitFor({ timeout: 15_000 });
    await gm.getByRole('button', { name: /publish to player/i }).click();
    await player.locator('h1', { hasText: 'Case file' }).waitFor({ timeout: 10_000 });
    await shot(player, '10-report');
  });

  await step('GM config editor keeps focus while typing and saves', async () => {
    await gm.locator('summary', { hasText: 'Code gate' }).click();
    const code = gm.getByLabel('Unlock code (letters/digits, case and dashes ignored)', { exact: true });
    await code.fill('');
    await code.pressSequentially('MAGENTA31');
    if ((await code.inputValue()) !== 'MAGENTA31') throw new Error('typed value lost');
    if (!(await code.evaluate((el) => document.activeElement === el))) throw new Error('focus lost while typing');
    const saved = gm.waitForResponse((r) => r.url().includes('/api/gm/config') && r.ok());
    await gm.getByRole('button', { name: /save config/i }).click();
    await saved;
    await gm.getByText('Saved and pushed').waitFor({ timeout: 10_000 });
    const st = await (await fetch(`${base}/api/gm/overview`, { headers: { cookie: (await desk.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } })).json();
    if (st.config.gate.code !== 'MAGENTA31') throw new Error(`server kept ${st.config.gate.code}`);
    const restored = gm.waitForResponse((r) => r.url().includes('/api/gm/config') && r.ok());
    await code.fill('MAGENTA30');
    await gm.getByRole('button', { name: /save config/i }).click();
    await restored;
  });

  await step('GM resets the game and the player returns to the intro', async () => {
    gm.once('dialog', (d) => d.accept());
    await gm.locator('select').nth(1).selectOption('game');
    await gm.getByRole('button', { name: /^reset$/i }).click();
    await player.getByRole('button', { name: /initiate recovery protocol/i }).waitFor({ timeout: 10_000 });
  });

  await step('player view never leaks secrets', async () => {
    const res = await fetch(`${base}/api/player/state`);
    const text = await res.text();
    for (const secret of ['MAGENTA30', 'CANIS30', '"ALPHA"', 'Agent Vector', 'canonical']) {
      if (text.includes(secret)) throw new Error(`leaked ${secret}`);
    }
  });
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  fs.rmSync(dataDir, { recursive: true, force: true });
}

if (failures) {
  console.log(`\n${failures} step(s) failed. Server log:\n${serverLog.join('')}`);
  process.exit(1);
}
console.log('\nall smoke steps passed; screenshots in e2e/output');
