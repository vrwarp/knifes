// Captures every player and GM screen with text fully revealed, for design review.
// Usage: node screens.mjs   -> e2e/output/screens/*.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
// Types a word on the puzzle's on-screen keyboard; the ENTER key is the "Attempt key" button.
const typeWord = async (page, word) => {
  const kb = page.getByRole('group', { name: 'Keyboard' });
  await kb.waitFor();
  const engage = page.getByRole('dialog').getByRole('button', { name: /engage/i });
  if (await engage.count()) await engage.click();
  for (const l of word.toUpperCase()) await kb.getByRole('button', { name: new RegExp(`^${l}(,|$)`) }).click();
};


const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'output', 'screens');
fs.mkdirSync(out, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-screens-'));
const port = await new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const base = `http://127.0.0.1:${port}`;

const server = spawn('node', ['--disable-warning=ExperimentalWarning', 'dist/index.js'], {
  cwd: path.join(root, 'server'),
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, GM_PASSWORD: 'test', AI_MODE: 'mock', CLIENT_DIST: path.join(root, 'client', 'dist') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${base}/healthz`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

// GM API helper (cookie auth)
const login = await fetch(`${base}/api/gm/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'test' }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const gmApi = (p, init = {}) => fetch(`${base}${p}`, { ...init, headers: { cookie, ...(init.json ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) }, body: init.json ? JSON.stringify(init.json) : init.body });

const candidates = [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium'].filter(Boolean);
let executablePath;
for (const c of candidates) { try { if (fs.statSync(c).isFile()) { executablePath = c; break; } } catch {} }
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

try {
  // Two placeholder "field photos" drawn on a canvas, uploaded like a GM would.
  const art = await browser.newPage({ viewport: { width: 800, height: 600 } });
  for (const [name, hue] of [['a', 200], ['b', 30]]) {
    await art.setContent(`<canvas id=c width=800 height=600></canvas><script>(() => {
      const x=document.getElementById('c').getContext('2d');
      x.fillStyle='hsl(${hue},30%,70%)';x.fillRect(0,0,800,600);
      x.fillStyle='hsl(${hue},20%,35%)';x.fillRect(0,380,800,220);
      for(let i=0;i<9;i++){x.fillStyle='hsl(${hue},25%,'+(45+i*3)+'%)';x.fillRect(40+i*85,160+(i%3)*30,70,220-(i%3)*30);}
      x.fillStyle='#eee';x.fillRect(300,300,200,60);x.fillStyle='#222';x.font='bold 28px sans-serif';x.fillText('DELI',365,342);
    })();</script>`);
    await art.waitForFunction(() => { const c = document.getElementById('c'); return c && c.getContext('2d').getImageData(1, 1, 1, 1).data[3] === 255; });
    await settle(200);
    const buf = await art.screenshot({ type: 'png' });
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'image/png' }), `photo-${name}.png`);
    await gmApi('/api/gm/upload?kind=photo', { method: 'POST', body: fd });
  }
  await art.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const player = await phone.newPage();
  const shot = async (page, name) => { await settle(); await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true }); console.log('captured', name); };
  const finishTyping = async () => { for (const el of await player.locator('.typed-stack').all()) { try { await el.click({ timeout: 500 }); } catch {} } await settle(150); };

  await player.goto(base);
  await player.getByRole('button', { name: /initiate recovery protocol/i }).waitFor();
  await finishTyping();
  await shot(player, 'p01-intro');
  await player.getByRole('button', { name: /initiate recovery protocol/i }).click();

  await player.locator('.map').waitFor();
  await finishTyping();
  await settle(1500);
  await shot(player, 'p02-geo-map');
  await player.getByRole('button', { name: /tap to unlock map/i }).click();
  await player.locator('.map').click({ position: { x: 150, y: 150 } });
  await shot(player, 'p02b-geo-pinned');
  await player.getByRole('button', { name: /triangulate/i }).click();
  await player.getByText('LOCATION CONFIRMED').waitFor();
  await shot(player, 'p03-geo-confirmed');
  await player.getByRole('button', { name: /proceed/i }).click();

  await player.locator('h1', { hasText: 'Secure line' }).waitFor();
  await finishTyping();
  await shot(player, 'p04-gate');
  await player.getByLabel('Recovery key').fill('WRONGKEY');
  await player.getByRole('button', { name: /submit key/i }).click();
  await player.getByText('KEY REJECTED').waitFor();
  await shot(player, 'p05-gate-rejected');
  await player.getByLabel('Recovery key').fill('MAGENTA30');
  await player.getByRole('button', { name: /submit key/i }).click();
  await player.getByText('Recovery key accepted').waitFor();
  await shot(player, 'p05b-gate-accepted');

  await player.locator('h1', { hasText: 'Brute-force key' }).waitFor({ timeout: 10_000 });
  await shot(player, 'p06-hack-race');
  // The rest of the sequence uses the fixed secret so the captions stay true.
  {
    const c = (await (await gmApi('/api/gm/overview')).json()).config;
    c.hack.mode = 'solo';
    c.hack.secret = 'ALPHA';
    c.hack.maxAttempts = 6;
    await gmApi('/api/gm/config', { method: 'PUT', json: c });
  }
  await settle(400);
  await shot(player, 'p06-hack-empty');
  for (const w of ['APPLE', 'PLANT']) {
    await typeWord(player, w);
    await player.getByRole('button', { name: /attempt key/i }).click();
    await settle(300);
  }
  await shot(player, 'p07-hack-two-rows');
  for (const w of ['BRICK', 'STORM', 'QUEST', 'ZEBRA']) {
    await typeWord(player, w);
    await player.getByRole('button', { name: /attempt key/i }).click();
    await settle(300);
  }
  await player.getByText('PARTITION LOCKED', { exact: true }).waitFor();
  await shot(player, 'p08-hack-locked');
  await gmApi('/api/gm/reset', { method: 'POST', json: { scope: 'hack' } });
  await player.getByRole('group', { name: 'Keyboard' }).waitFor({ timeout: 10_000 });
  await typeWord(player, 'ALPHA');
  await player.getByRole('button', { name: /attempt key/i }).click();
  await player.getByText('KEY ACCEPTED').waitFor();
  await settle(900);
  await shot(player, 'p08b-hack-solved');

  await player.locator('h1', { hasText: 'INCIDENT RECORD' }).waitFor({ timeout: 10_000 });
  await finishTyping();
  await shot(player, 'p09-reveal');
  await player.getByRole('button', { name: /return to base/i }).click();

  await player.getByRole('tab', { name: 'evidence' }).waitFor();
  await player.locator('.file header', { hasText: '00_Directors' }).waitFor();
  await shot(player, 'p10-evidence-vault');
  await player.locator('.file header', { hasText: '00_Directors' }).click();
  await player.locator('.file header', { hasText: '01_Vault' }).click();
  await player.getByText('03:42').first().waitFor();
  await shot(player, 'p10b-evidence-logs');
  await player.locator('.file header', { hasText: '01_Vault' }).click();
  await player.locator('.file header', { hasText: '03_Toxicology' }).click();
  await player.getByText('PRELIMINARY TOXICOLOGY').waitFor();
  await shot(player, 'p11-evidence-toxicology');

  await player.getByRole('tab', { name: 'archive' }).click();
  for (const q of ['who was in the office at 03:45', 'read the toxicology report']) {
    await player.getByLabel('Query').fill(q);
    await player.getByRole('button', { name: /send/i }).click();
    await settle(600);
  }
  await player.locator('.msg.assistant', { hasText: 'Nightshade' }).waitFor({ timeout: 10_000 });
  await shot(player, 'p12-archive');

  await gmApi('/api/gm/hint', { method: 'POST', json: { text: 'Transmission note: the toxin takes thirty minutes. Count back from the time of death, then ask the ARCHIVE who was in the office at that minute.' } });
  await player.getByRole('dialog', { name: /incoming transmission/i }).waitFor({ timeout: 10_000 });
  await shot(player, 'p13-hint-overlay');
  await player.getByRole('button', { name: /acknowledge/i }).click();
  await player.getByRole('button', { name: /transmissions/i }).click();
  await shot(player, 'p14-transmissions');
  await player.getByRole('button', { name: /^close$/i }).click();

  await player.getByRole('tab', { name: 'deduction' }).click();
  const fill = async (answers) => { for (const [label, value] of Object.entries(answers)) await player.getByLabel(label, { exact: true }).fill(value); };
  await fill({ TIME: '3:45 am', SUSPECT: 'Agent Cipher', METHOD: 'poisoned tea', ASSET: 'the ledger', MOTIVE: 'to sell it', 'PHYSICAL PROP': 'birthday card envelope' });
  await shot(player, 'p15-deduction-filled');
  await player.getByRole('button', { name: /submit deduction/i }).click();
  await player.getByText('DEDUCTION REJECTED').waitFor({ timeout: 15_000 });
  await shot(player, 'p16-deduction-rejected');
  await fill({ SUSPECT: 'Agent Vector' });
  await player.getByRole('button', { name: /submit deduction/i }).click();
  await player.locator('h1', { hasText: 'DEDUCTION VERIFIED' }).first().waitFor({ timeout: 15_000 });
  await finishTyping();
  await shot(player, 'p17-solved-beat1');
  for (let i = 0; i < 6; i++) {
    await finishTyping();
    const next = player.getByRole('button', { name: /^continue$/i });
    if (!(await next.count())) break;
    await next.click();
  }
  await finishTyping();
  await shot(player, 'p17b-solved-final');
  await gmApi('/api/gm/report/generate', { method: 'POST' });
  await gmApi('/api/gm/report/publish', { method: 'POST', json: { published: true } });
  await player.getByText('CASE FILE 30-0415').first().waitFor({ timeout: 10_000 });
  await finishTyping();
  await shot(player, 'p18-solved-report');

  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const gm = await desk.newPage();
  await gm.goto(`${base}/gm`);
  await gm.getByLabel('Password').fill('test');
  await gm.getByRole('button', { name: /enter/i }).click();
  await gm.getByText('GM console').waitFor();
  await gm.locator('.chip.now', { hasText: 'Case closed' }).waitFor({ timeout: 10_000 });
  await settle(800);
  await shot(gm, 'g01-console');
  await gm.locator('summary', { hasText: 'Location puzzle' }).click();
  await gm.locator('summary', { hasText: 'Deduction grid' }).click();
  await gm.locator('summary', { hasText: 'time:' }).click();
  await shot(gm, 'g02-config-open');
  await desk.close();

  const gmPhone = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const gp = await gmPhone.newPage();
  await gp.goto(`${base}/gm`);
  await gp.getByLabel('Password').fill('test');
  await gp.getByRole('button', { name: /enter/i }).click();
  await gp.getByText('GM console').waitFor();
  await settle(800);
  await shot(gp, 'g03-console-phone');
  await gmPhone.close();
  await phone.close();
} finally {
  await browser.close();
  server.kill('SIGTERM');
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`done: ${fs.readdirSync(out).length} screenshots in ${out}`);
