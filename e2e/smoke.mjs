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

// Types a word on the puzzle's on-screen keyboard after dismissing the briefing; ENTER is the "Attempt key" button.
const typeWord = async (page, word, scope = page) => {
  const kb = scope.getByRole('group', { name: 'Keyboard' }).first();
  await kb.waitFor();
  const engage = page.getByRole('dialog').getByRole('button', { name: /engage/i });
  if (await engage.count()) await engage.click();
  for (const l of word.toUpperCase()) await kb.getByRole('button', { name: new RegExp(`^${l}$`) }).click();
};
const clearWord = async (page, scope = page) => {
  const back = scope.getByRole('group', { name: 'Keyboard' }).first().getByRole('button', { name: 'Delete letter' });
  for (let i = 0; i < 32 && (await back.isEnabled()); i++) await back.click();
};
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
  // Typewriter text gates the next button; tapping the text finishes it.
  const finishTyping = async (page) => {
    for (const el of await page.locator('.typed-stack').all()) { try { await el.click({ timeout: 500 }); } catch {} }
    await new Promise((r) => setTimeout(r, 150));
  };
  // The verdict lands in beats separated by CONTINUE buttons.
  const finishBeats = async (page) => {
    for (let i = 0; i < 6; i++) {
      await finishTyping(page);
      const next = page.getByRole('button', { name: /^continue$/i });
      if (!(await next.count())) break;
      await next.click();
    }
    await finishTyping(page);
  };

  await step('GM sets the hiding place of the Ledger hard copy (the prop slot ships as a placeholder)', async () => {
    const login = await fetch(`${base}/api/gm/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'test' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const gmApi = (p, init = {}) => fetch(`${base}${p}`, { ...init, headers: { cookie, ...(init.json ? { 'content-type': 'application/json' } : {}) }, body: init.json ? JSON.stringify(init.json) : undefined });
    const c = await (await gmApi('/api/gm/overview')).json();
    const cfg = c.config;
    Object.assign(cfg.deduction.slots.find((s) => s.id === 'prop'), { canonical: 'the birthday card envelope', accept: ['card', 'envelope'], reject: ['book', 'bottle'] });
    await gmApi('/api/gm/config', { method: 'PUT', json: cfg });
  });

  await step('player sees the intro', async () => {
    await player.goto(base);
    await player.locator('h1', { hasText: 'MAGENTA CHANNEL' }).waitFor();
    await finishTyping(player);
    await shot(player, '01-intro');
    await player.getByRole('button', { name: /initiate recovery protocol/i }).click();
  });

  await step('geo puzzle accepts a pin (no target configured)', async () => {
    await player.locator('h1', { hasText: 'Field transmission' }).waitFor();
    const map = player.locator('.map');
    await map.waitFor();
    await player.getByRole('button', { name: /tap to unlock map/i }).click();
    await map.click({ position: { x: 150, y: 150 } });
    await player.getByRole('button', { name: /triangulate/i }).click();
    await player.getByText('LOCATION CONFIRMED').waitFor();
    await shot(player, '02-geo');
    await player.getByRole('button', { name: /proceed/i }).click();
  });

  await step('gate rejects a wrong code and accepts S30GHOST', async () => {
    await player.locator('h1', { hasText: 'Secure line' }).waitFor();
    await typeWord(player, 'WRONG');
    await player.getByRole('button', { name: /submit key/i }).click();
    await player.getByText('KEY REJECTED').waitFor();
    await box.fill('s30-ghost');
    await player.getByRole('button', { name: /submit key/i }).click();
    await player.locator('h1', { hasText: 'Brute-force key' }).waitFor({ timeout: 10_000 });
  });

  await step('word race scores a guess, then solves with the drawn key', async () => {
    await typeWord(player, 'station');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await player.getByRole('img', { name: /Attempt 1:/ }).waitFor();
    await player.getByText(/Adversary/).first().waitFor();
    await shot(player, '03-hack');
    // The key is drawn from the bank each round; the GM overview knows it.
    const login = await fetch(`${base}/api/gm/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'test' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const st = await (await fetch(`${base}/api/gm/overview`, { headers: { cookie } })).json();
    await typeWord(player, st.state.hack.secret);
    await player.getByRole('button', { name: /attempt key/i }).click();
    await player.locator('h1', { hasText: 'LEDGER DECRYPTED' }).waitFor({ timeout: 10_000 });
    await finishTyping(player);
    await shot(player, '04-reveal');
    await player.getByRole('button', { name: /return to headquarters/i }).click();
  });

  await step('Ledger Layer 01 lists the five agents and Layer 02 is sealed', async () => {
    await player.getByRole('tab', { name: 'ledger' }).waitFor();
    await player.locator('.agent header', { hasText: 'Nina Calder' }).click();
    await player.getByText('Working in the archives.').waitFor();
    await player.locator('.file header', { hasText: 'LAYER 02' }).click();
    await player.getByLabel('Passcode').waitFor();
    await shot(player, '05-ledger-layer1');
  });

  await step('ARCHIVE answers a where-was-everyone question (mock)', async () => {
    await player.getByRole('tab', { name: 'archive' }).click();
    await player.getByLabel('Query').fill('where was everyone at 2:14');
    await player.getByRole('button', { name: /send/i }).click();
    await player.locator('.msg.assistant', { hasText: 'Nina Calder' }).waitFor({ timeout: 10_000 });
    await shot(player, '06-archive');
  });

  await step('GM logs in and sees live state', async () => {
    await gm.goto(`${base}/gm`);
    await gm.getByLabel('Password').fill('test');
    await gm.getByRole('button', { name: /enter/i }).click();
    await gm.getByText('GM console').waitFor();
    await gm.locator('.chip.now', { hasText: 'investigation' }).waitFor({ timeout: 10_000 });
    await gm.locator('.log .ev', { hasText: 'archive user' }).first().waitFor();
    await shot(gm, '07-gm');
  });

  await step('GM releases Ledger Layer 02 and the phone shows the classified evidence', async () => {
    gm.once('dialog', (d) => d.accept());
    await gm.getByRole('button', { name: /^release layer 02$/i }).click();
    await player.getByRole('dialog', { name: /incoming transmission/i }).waitFor({ timeout: 10_000 });
    await player.getByRole('button', { name: /acknowledge/i }).click();
    await player.getByRole('tab', { name: 'ledger' }).click();
    await player.getByText('Confirmed time of death:').waitFor({ timeout: 10_000 });
    await player.locator('.agent.l2 header', { hasText: 'Nina Calder' }).click();
    await player.getByText('Silver letter opener').waitFor();
    await shot(player, '07b-ledger-layer2');
  });

  await step('GM pushes a hint and the player sees the transmission', async () => {
    await gm.getByLabel('Transmission text').fill('Hold what they told you against what the Ledger recorded.');
    await gm.getByRole('button', { name: /push to his screen/i }).click();
    await player.getByRole('dialog', { name: /incoming transmission/i }).waitFor({ timeout: 10_000 });
    await shot(player, '08-hint');
    await player.getByRole('button', { name: /acknowledge/i }).click();
  });

  await step('deduction rejects a wrong suspect and verifies the right answers', async () => {
    await player.getByRole('tab', { name: 'deduction' }).click();
    const fill = async (answers) => {
      for (const [label, value] of Object.entries(answers)) await player.getByLabel(label, { exact: true }).fill(value);
    };
    await fill({ TIME: '2:14 am', SUSPECT: 'Mara Voss', METHOD: 'the letter opener', ASSET: 'the ledger', MOTIVE: 'to sell it', 'PHYSICAL PROP': 'birthday card envelope' });
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await player.getByText('DEDUCTION REJECTED').waitFor({ timeout: 15_000 });
    await fill({ SUSPECT: 'Nina Calder' });
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await player.locator('h1', { hasText: 'DEDUCTION VERIFIED' }).first().waitFor({ timeout: 15_000 });
    await finishBeats(player);
    await shot(player, '09-solved');
  });

  await step('GM generates and publishes the case report (mock)', async () => {
    await gm.getByRole('button', { name: /generate with ai/i }).click();
    await gm.getByText('Report generated').waitFor({ timeout: 15_000 });
    await gm.getByRole('button', { name: /publish to player/i }).click();
    await player.getByText('CASE FILE 30-0214').first().waitFor({ timeout: 10_000 });
    await shot(player, '10-report');
  });

  await step('GM config editor keeps focus while typing and saves', async () => {
    await gm.locator('summary', { hasText: 'Code gate' }).click();
    const code = gm.getByLabel('Unlock code (letters/digits, case and dashes ignored)', { exact: true });
    await code.fill('');
    await code.pressSequentially('S30GHOST2');
    if ((await code.inputValue()) !== 'S30GHOST2') throw new Error('typed value lost');
    if (!(await code.evaluate((el) => document.activeElement === el))) throw new Error('focus lost while typing');
    const saved = gm.waitForResponse((r) => r.url().includes('/api/gm/config') && r.ok());
    await gm.getByRole('button', { name: /save config/i }).click();
    await saved;
    await gm.getByText('Saved and pushed').waitFor({ timeout: 10_000 });
    const st = await (await fetch(`${base}/api/gm/overview`, { headers: { cookie: (await desk.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } })).json();
    if (st.config.gate.code !== 'S30GHOST2') throw new Error(`server kept ${st.config.gate.code}`);
    const restored = gm.waitForResponse((r) => r.url().includes('/api/gm/config') && r.ok());
    await code.fill('S30GHOST');
    await gm.getByRole('button', { name: /save config/i }).click();
    await restored;
  });

  await step('GM can type into the coordinate and list fields key by key', async () => {
    await gm.locator('summary', { hasText: 'Location puzzle' }).click();
    const coords = gm.getByPlaceholder('34.66, -118.41');
    await coords.fill('');
    await coords.pressSequentially('34.05, -118.24');
    if ((await coords.inputValue()) !== '34.05, -118.24') throw new Error(`coordinates lost keystrokes: ${await coords.inputValue()}`);
    await gm.locator('summary', { hasText: 'Deduction grid' }).click();
    await gm.locator('summary', { hasText: 'time:' }).click();
    const accept = gm.getByLabel('Accepted phrasings (comma separated)', { exact: true }).first();
    await accept.fill('');
    await accept.pressSequentially('02:14, 2:14,');
    if ((await accept.inputValue()) !== '02:14, 2:14,') throw new Error(`list field lost keystrokes: ${await accept.inputValue()}`);
    await gm.getByRole('button', { name: /discard/i }).click();
  });

  await step('GM resets the game and the player returns to the intro', async () => {
    await gm.locator('summary', { hasText: 'Danger zone' }).click();
    gm.once('dialog', (d) => d.accept('RESET'));
    await gm.getByRole('button', { name: /reset whole game/i }).click();
    await player.getByRole('button', { name: /initiate recovery protocol/i }).waitFor({ timeout: 10_000 });
  });

  await step('player view never leaks secrets', async () => {
    const res = await fetch(`${base}/api/player/state`);
    const text = await res.text();
    for (const secret of ['S30GHOST', 'MAGENTA30', '"ALPHA"', 'Nina Calder', 'canonical']) {
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
