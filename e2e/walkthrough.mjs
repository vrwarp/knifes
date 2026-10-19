// Drives the real app through every player and GM journey and records it for the visual walkthrough.
// Usage: node walkthrough.mjs   -> e2e/output/walkthrough/{shots/*.jpg, video/*.webm, manifest.json}
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
// Types a word on the puzzle's on-screen keyboard; the ENTER key is the "Attempt key" button.
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


const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'output', 'walkthrough');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });
fs.mkdirSync(path.join(out, 'video'), { recursive: true });
const tmpDirs = [];
const servers = [];
process.on('exit', () => servers.forEach((s) => s.kill('SIGTERM')));

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
async function startServer(extraEnv = {}) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-walk-'));
  tmpDirs.push(dataDir);
  const server = spawn('node', ['--disable-warning=ExperimentalWarning', 'dist/index.js'], {
    cwd: path.join(root, 'server'),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, GM_PASSWORD: 'test', AI_MODE: 'mock', CLIENT_DIST: path.join(root, 'client', 'dist'), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servers.push(server);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const login = await fetch(`${base}/api/gm/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'test' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const gmApi = (p, init = {}) => fetch(`${base}${p}`, { ...init, headers: { cookie, ...(init.json ? { 'content-type': 'application/json' } : {}) }, body: init.json ? JSON.stringify(init.json) : init.body });
  const config = async () => (await (await gmApi('/api/gm/overview')).json()).config;
  const patch = async (fn) => { const c = await config(); fn(c); const r = await gmApi('/api/gm/config', { method: 'PUT', json: c }); if (!r.ok) throw new Error(`config ${r.status} ${await r.text()}`); };
  const resetGame = () => gmApi('/api/gm/reset', { method: 'POST', json: { scope: 'game' } });
  return { base, server, gmApi, config, patch, resetGame };
}

const candidates = [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium'].filter(Boolean);
let executablePath;
for (const c of candidates) { try { if (fs.statSync(c).isFile()) { executablePath = c; break; } } catch {} }
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- manifest -------------------------------------------------------------------------------
const manifest = { generatedAt: new Date().toISOString(), journeys: [] };
let journey = null;
let n = 0;
const begin = (id, title, summary) => { journey = { id, title, summary, steps: [], videos: [] }; manifest.journeys.push(journey); console.log(`\n== ${title}`); };
async function shot(page, title, note, { device = 'phone', full = true, pair = null, wait = 450 } = {}) {
  await sleep(wait);
  const file = `${String(++n).padStart(3, '0')}-${journey.id}.jpg`;
  shooting = true;
  try { await page.screenshot({ path: path.join(out, 'shots', file), fullPage: full, type: 'jpeg', quality: 78 }); } finally { await sleep(120); shooting = false; }
  journey.steps.push({ title, note, file, device, pair });
  console.log('  shot', file, title);
  return file;
}
const dialogs = [];
const autoDialogs = (page, answer = null) => page.on('dialog', async (d) => { dialogs.push(d.message()); await (d.type() === 'prompt' ? d.accept(answer ?? '') : d.accept()); });
const lastDialog = () => dialogs[dialogs.length - 1] ?? '';

const phoneOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const deskOpts = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 };
const finishTyping = async (page) => { for (const el of await page.locator('.typed-stack').all()) { try { await el.click({ timeout: 500 }); } catch {} } await sleep(150); };
async function gmLogin(page, base) {
  await page.goto(`${base}/gm`);
  await page.getByLabel('Password').fill('test');
  await page.getByRole('button', { name: /enter/i }).click();
  await page.getByText('GM console').first().waitFor();
}
async function uploadPhotos(app) {
  const art = await browser.newPage({ viewport: { width: 800, height: 600 } });
  for (const [name, hue, label] of [['a', 200, 'LAKE'], ['b', 30, 'ELIZABETH LK RD']]) {
    await art.setContent(`<canvas id=c width=800 height=600></canvas><script>(() => {
      const x=document.getElementById('c').getContext('2d');
      x.fillStyle='hsl(${hue},30%,70%)';x.fillRect(0,0,800,600);
      x.fillStyle='hsl(${hue},20%,35%)';x.fillRect(0,380,800,220);
      for(let i=0;i<9;i++){x.fillStyle='hsl(${hue},25%,'+(45+i*3)+'%)';x.fillRect(40+i*85,160+(i%3)*30,70,220-(i%3)*30);}
      x.fillStyle='#eee';x.fillRect(250,300,300,60);x.fillStyle='#222';x.font='bold 28px sans-serif';x.textAlign='center';x.fillText('${label}',400,342);
    })();</script>`);
    await art.waitForFunction(() => { const c = document.getElementById('c'); return c && c.getContext('2d').getImageData(1, 1, 1, 1).data[3] === 255; });
    const buf = await art.screenshot({ type: 'png' });
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'image/png' }), `photo-${name}.png`);
    await app.gmApi('/api/gm/upload?kind=photo', { method: 'POST', body: fd });
  }
  await art.close();
}
let shooting = false;
async function recorder(page, name, width) {
  const dir = path.join(out, 'raw', name);
  fs.mkdirSync(dir, { recursive: true });
  const s = await page.context().newCDPSession(page);
  const frames = [];
  s.on('Page.screencastFrame', async (f) => {
    try { await s.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
    if (shooting) return;
    const file = path.join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
  });
  await s.send('Page.startScreencast', { format: 'jpeg', quality: 72 });
  return {
    async stop(title, device) {
      try { await s.send('Page.stopScreencast'); } catch {}
      await sleep(200);
      if (frames.length < 2) return;
      const lines = [];
      frames.forEach((f, i) => {
        const next = frames[i + 1];
        const d = next ? Math.min(Math.max(next.t - f.t, 0.02), 4) : 2;
        lines.push(`file '${f.file}'`, `duration ${d.toFixed(3)}`);
      });
      lines.push(`file '${frames[frames.length - 1].file}'`);
      const list = path.join(dir, 'list.txt');
      fs.writeFileSync(list, lines.join('\n'));
      const dest = path.join(out, 'video', `${name}.mp4`);
      await new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=${width}:-2:flags=lanczos,format=yuv420p`, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-movflags', '+faststart', dest], { stdio: 'inherit' });
        ff.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`))));
      });
      const secs = frames[frames.length - 1].t - frames[0].t + 2;
      journey.videos.push({ file: `${name}.mp4`, title, device, seconds: Math.round(secs) });
      console.log('  video', name, `${Math.round(secs)}s`, `${(fs.statSync(dest).size / 1e6).toFixed(1)} MB`);
    },
  };
}

const app = await startServer();
try {
  await uploadPhotos(app);

  // ============================================================================================
  begin('main', 'The full game, start to finish', 'One continuous run on the phone with the GM console open on a laptop: every stage in its default mode, a wrong answer at each gate, a hint pushed mid-investigation, and the case report at the end.');
  const phoneCtx = await browser.newContext(phoneOpts);
  // The prop slot ships as a GM placeholder; this recording hides the hard copy in the card envelope.
  await app.patch((c) => Object.assign(c.deduction.slots.find((x) => x.id === 'prop'), { canonical: 'the birthday card envelope', accept: ['card', 'envelope'], reject: ['book', 'bottle'] }));
  const player = await phoneCtx.newPage();
  const deskCtx = await browser.newContext(deskOpts);
  const gm = await deskCtx.newPage();
  autoDialogs(gm);
  const recGm = await recorder(gm, 'main-gm', 1280);
  const recPlayer = await recorder(player, 'main-phone', 540);
  await gmLogin(gm, app.base);
  await sleep(800);
  await shot(gm, 'GM console before the player arrives', 'The NOW strip reads Waiting for the QR scan and warns that no phone is linked. Nothing has started.', { device: 'desktop' });

  await player.goto(app.base);
  await player.getByRole('button', { name: /initiate recovery protocol/i }).waitFor();
  await sleep(1500);
  await shot(player, 'QR landing, text still typing', 'The briefing types out like a terminal. The button stays disabled until it finishes; a tap on the text skips ahead.', { full: false, wait: 0 });
  await finishTyping(player);
  await shot(player, 'QR landing', 'The first thing Jimmy sees after scanning the QR code hidden in the book safe.');
  await shot(gm, 'GM console: phone linked', 'As soon as the phone opens the link, the console shows it as linked.', { device: 'desktop', full: false });
  await player.getByRole('button', { name: /initiate recovery protocol/i }).click();

  await player.locator('.map').waitFor();
  await sleep(2500);
  await finishTyping(player);
  await shot(player, 'Location puzzle: photos and a locked map', 'Two field photos (tap to zoom) and a map that starts locked so the page scrolls past it.');
  await player.locator('.photos img').first().click();
  await shot(player, 'Photo zoomed', 'Tapping a photo opens it full screen; tap again to close.', { full: false });
  await player.getByRole('dialog', { name: 'Field image' }).getByRole('button').click();
  await player.getByRole('dialog', { name: 'Field image' }).waitFor({ state: 'detached' });
  await player.getByRole('button', { name: /tap to unlock map/i }).click();
  await player.locator('.map').click({ position: { x: 170, y: 140 } });
  await shot(player, 'Map unlocked and pinned', 'One tap unlocks the map, a second tap drops the magenta marker. LOCK MAP hands scrolling back to the page.');
  await player.getByRole('button', { name: /triangulate/i }).click();
  await player.getByText('LOCATION CONFIRMED').waitFor();
  await finishTyping(player);
  await shot(player, 'Location confirmed', 'With no target configured any pin is accepted; the GM console warns about that. With a target set, the pin must land inside the radius (see the location variants journey).');
  await player.getByRole('button', { name: /proceed/i }).click();

  await player.locator('h1', { hasText: 'Secure line' }).waitFor();
  await finishTyping(player);
  await shot(player, 'Code gate', 'The note at the drop tells Jimmy to call Phil with the challenge phrase. Phil reads out the recovery authorization code.');
  await typeWord(player, 'WRONGKEY');
  await player.getByRole('button', { name: /submit key/i }).click();
  await player.getByText('KEY REJECTED').waitFor();
  await shot(player, 'Wrong key', 'The rejection stays on screen until Jimmy types again.');
  await clearWord(player);
  await typeWord(player, 'S30GHOST');
  await player.getByRole('button', { name: /submit key/i }).click();
  await player.getByText('Recovery authorization accepted').waitFor();
  await shot(player, 'Key accepted', 'The success state holds for a beat before the next stage arrives.', { wait: 150 });

  await player.locator('h1', { hasText: 'Brute-force key' }).waitFor({ timeout: 10_000 });
  await shot(player, 'Word race', 'Jimmy races a hostile AI process for the same five-letter key. He sees its colour feedback, it sees only its own. This recording switches to the fixed-secret solo mode for the next steps.');
  await app.patch((c) => { c.hack.mode = 'solo'; c.hack.secret = 'ALPHA'; });
  await player.getByRole('group', { name: 'Keyboard' }).waitFor();
  for (const w of ['APPLE', 'PLANT']) {
    await typeWord(player, w);
    await player.getByRole('button', { name: /attempt key/i }).click();
    await sleep(500);
  }
  await shot(player, 'Two attempts scored', 'Green is placed, amber is misplaced, dark is absent. Each tile also carries a shape cue for colour-blind players.');
  await shot(gm, 'GM console during the word puzzle', 'Player status shows the secret and every guess. Quick hints for this stage sit at the top of the hints panel.', { device: 'desktop', full: false });
  await typeWord(player, 'ALPHA');
  await player.getByRole('button', { name: /attempt key/i }).click();
  await player.getByText('KEY ACCEPTED').waitFor();
  await sleep(900);
  await shot(player, 'Partition unlocked', 'The winning row flips green and the screen holds for two seconds.', { wait: 0 });

  await player.locator('h1', { hasText: 'LEDGER DECRYPTED' }).waitFor({ timeout: 10_000 });
  await finishTyping(player);
  await shot(player, 'Ledger decrypted', 'The personnel files are open and Jimmy is ordered back to headquarters, where the five agents are held. RETURN TO HEADQUARTERS scrolls into view once the text finishes.');
  await player.getByRole('button', { name: /return to headquarters/i }).click();

  await player.locator('.agent header', { hasText: 'Mara Voss' }).waitFor();
  await shot(player, 'Personnel files', 'Dinner begins. Investigation has three tabs. The Ledger opens on the five personnel files, name on one line and role on the next; the header names the window he must ask each agent about. Nothing hints that more records exist.');
  await player.locator('.agent header', { hasText: 'Nina Calder' }).click();
  await player.getByText(/rarely forgets a conversation/i).waitFor();
  await shot(player, 'A personnel file', 'Each agent: service, clearance, posting and profile. Nothing about the night; Jimmy gets that from the agents at the table.');

  await player.getByRole('tab', { name: 'archive' }).click();
  await shot(player, 'ARCHIVE terminal', 'An in-world AI that answers from the Ledger through tools. It knows the personnel files, has no record of the night until the release and never admits one exists, and never names the culprit.');
  for (const q of ['tell me about Nina Calder', 'where was everyone at 2:14', 'read the surveillance records']) {
    await player.getByLabel('Query').fill(q);
    await player.getByRole('button', { name: /send/i }).click();
    await sleep(700);
    await finishTyping(player);
  }
  await player.locator('.msg.assistant', { hasText: 'NO RECORD' }).last().waitFor({ timeout: 10_000 });
  await finishTyping(player);
  await shot(player, 'ARCHIVE answering questions', 'Integrity rises with every question. These replies come from the scripted mock; on the night they come from Claude on the organizer’s subscription.');

  await shot(gm, 'The calls and the Ledger panel', 'Whoever plays Phil and Matt reads from the console: the challenge phrase, both codes in large type, the call scripts, and the Release records button for Matt\u2019s call.', { device: 'desktop', full: false });
  await gm.getByRole('button', { name: /^release records$/i }).click();
  await player.getByRole('dialog', { name: /incoming transmission/i }).waitFor({ timeout: 10_000 });
  await finishTyping(player);
  await shot(player, 'Records released', 'The release lands on the phone as a transmission and the Ledger tab lights up.', { full: false, wait: 0 });
  await player.getByRole('button', { name: /acknowledge/i }).click();
  await player.getByRole('tab', { name: 'ledger' }).click();
  await player.getByText('Confirmed time of death:').waitFor({ timeout: 10_000 });
  await player.locator('.agent.l2 header', { hasText: 'Nina Calder' }).click();
  await player.getByText('Silver letter opener').waitFor();
  await shot(player, 'Surveillance records', 'A new section appears: recorded movements from 10 PM, confiscated belongings and findings for every agent. Nina\u2019s badge opened the Director\u2019s Office at 2:11; a silver letter opener was on her.');

  await shot(gm, 'GM console during the investigation', 'Live log, ARCHIVE transcript and player status update live.', { device: 'desktop' });
  await gm.getByRole('button', { name: /^draft$/i }).click();
  await gm.getByText(/Copilot:/).waitFor({ timeout: 15_000 });
  await shot(gm, 'AI hint draft', "The copilot reads the player's progress and drafts a hint at the chosen strength. The GM edits it or pushes it as is.", { device: 'desktop', full: false });
  await gm.getByRole('button', { name: /push to his screen/i }).click();
  await player.getByRole('dialog', { name: /incoming transmission/i }).waitFor({ timeout: 10_000 });
  await sleep(800);
  await shot(player, 'Hint arrives on the phone', 'A pushed hint takes over the screen, closes the keyboard and focuses Acknowledge.', { full: false, wait: 0 });
  await finishTyping(player);
  await player.getByRole('button', { name: /acknowledge/i }).click();
  await player.getByRole('button', { name: /transmissions/i }).click();
  await shot(player, 'Transmissions received', 'Every hint so far, newest first, from the button in the top bar.', { full: false });
  await player.getByRole('button', { name: /^close$/i }).click();

  await player.getByRole('tab', { name: 'deduction' }).click();
  await shot(player, 'Master deduction, empty', 'Free text in each blank. The draft survives tab switches and reloads.');
  const fill = async (answers) => { for (const [label, value] of Object.entries(answers)) await player.getByLabel(label, { exact: true }).fill(value); };
  await fill({ TIME: '2:14 am', SUSPECT: 'Mara Voss', METHOD: 'the letter opener', ASSET: 'the ledger', MOTIVE: 'to sell it', 'PHYSICAL PROP': 'birthday card envelope' });
  await shot(player, 'Deduction filled in, wrong suspect', 'Everything right except the suspect.');
  await player.getByRole('button', { name: /submit deduction/i }).click();
  await sleep(900);
  await shot(player, 'Verifying', 'The verdict always takes at least two and a half seconds, with status lines cycling.', { full: false, wait: 0 });
  await player.getByText('DEDUCTION REJECTED').waitFor({ timeout: 15_000 });
  await shot(player, 'Deduction rejected', 'Pass or fail only: it does not say which field is wrong. The frame shakes and turns red.');
  await shot(gm, 'GM sees exactly what failed', 'The console shows the per-field result, which the player never sees, so the GMs can steer with a hint.', { device: 'desktop' });
  await fill({ SUSPECT: 'Nina Calder' });
  await player.getByRole('button', { name: /submit deduction/i }).click();
  await player.locator('h1', { hasText: 'DEDUCTION VERIFIED' }).first().waitFor({ timeout: 15_000 });
  await sleep(600);
  await shot(player, 'Deduction verified', 'The verdict plays in beats, one per CONTINUE.', { wait: 0 });
  for (let i = 0; i < 6; i++) {
    await finishTyping(player);
    const next = player.getByRole('button', { name: /^continue$/i });
    if (!(await next.count())) break;
    if (i === 1) await shot(player, 'Verdict, middle beat', 'Each beat types out before CONTINUE appears.');
    await next.click();
  }
  await finishTyping(player);
  await shot(player, 'Happy thirtieth', 'The last beat closes the case and turns into the birthday line.');
  await gm.getByRole('button', { name: /generate with ai/i }).click();
  await gm.getByText(/Generated \d/).waitFor({ timeout: 20_000 });
  await gm.getByRole('button', { name: /^preview$/i }).click();
  await shot(gm, 'Case report preview', 'After the win the GM generates a case file from the whole game log and previews it before publishing.', { device: 'desktop' });
  await gm.getByRole('button', { name: /publish to player/i }).click();
  await player.getByText('CASE FILE 30-0214').first().waitFor({ timeout: 10_000 });
  await finishTyping(player);
  await shot(player, 'Case file on the phone', 'Published, the report appears under the verdict. The GM can also print it.');
  await sleep(1500);
  await recPlayer.stop('The full run on the phone', 'phone');
  await recGm.stop('The GM console during the same run', 'desktop');
  await phoneCtx.close();
  await deskCtx.close();

  // ============================================================================================
  begin('geo', 'Location stage variants', 'The location stage has three modes, chosen in the GM config: a map puzzle, a reveal that only names the place, or off. The puzzle can also require a pin within a radius of a real target.');
  await app.resetGame();
  await app.patch((c) => { c.geo.mode = 'puzzle'; c.geo.target = { lat: 34.0407, lng: -118.2468 }; c.geo.radiusMeters = 250; });
  let ctx = await browser.newContext(phoneOpts);
  let p = await ctx.newPage();
  await p.goto(app.base);
  await finishTyping(p);
  await p.getByRole('button', { name: /initiate recovery protocol/i }).click();
  await p.locator('.map').waitFor();
  await sleep(2000);
  await finishTyping(p);
  await p.getByRole('button', { name: /tap to unlock map/i }).click();
  await p.locator('.map').click({ position: { x: 60, y: 60 } });
  await p.getByRole('button', { name: /triangulate/i }).click();
  await p.getByText(/SIGNAL MISMATCH/).waitFor();
  await shot(p, 'Puzzle with a target: pin too far', 'With a target and radius set, a miss reports the distance so Jimmy can correct course.');
  await ctx.close();

  await app.resetGame();
  await app.patch((c) => { c.geo.mode = 'reveal'; });
  ctx = await browser.newContext(phoneOpts);
  p = await ctx.newPage();
  await p.goto(app.base);
  await finishTyping(p);
  await p.getByRole('button', { name: /initiate recovery protocol/i }).click();
  await sleep(2500);
  await finishTyping(p);
  await shot(p, 'Reveal-only mode', 'No puzzle: the location is shown and Jimmy proceeds. Useful if the drop point must not be guessed.');
  await ctx.close();

  await app.resetGame();
  await app.patch((c) => { c.geo.mode = 'off'; });
  ctx = await browser.newContext(phoneOpts);
  p = await ctx.newPage();
  await p.goto(app.base);
  await finishTyping(p);
  await p.getByRole('button', { name: /initiate recovery protocol/i }).click();
  await p.locator('h1', { hasText: 'Secure line' }).waitFor();
  await finishTyping(p);
  await shot(p, 'Location stage off', 'The intro goes straight to the code gate, and the stage disappears from the GM progress chips.');
  await ctx.close();
  await app.patch((c) => { c.geo.mode = 'puzzle'; c.geo.target = null; });

  // ============================================================================================
  begin('hack', 'Word puzzle lockout and retry', 'Six wrong keys lock the partition for a countdown, then Jimmy can reset it and try again. The GM can also reset it at once. The lockout here is shortened to 8 seconds for the recording.');
  await app.resetGame();
  await app.patch((c) => { c.hack.lockoutSeconds = 8; c.hack.mode = 'solo'; c.hack.secret = 'ALPHA'; c.hack.maxAttempts = 6; });
  await app.gmApi('/api/gm/stage', { method: 'POST', json: { stage: 'hack' } });
  ctx = await browser.newContext(phoneOpts);
  p = await ctx.newPage();
  await p.goto(app.base);
  await p.locator('h1', { hasText: 'Brute-force key' }).waitFor();
  for (const w of ['BRICK', 'STORM', 'QUEST', 'ZEBRA', 'MOUND', 'CHILI']) {
    await typeWord(p, w);
    await p.getByRole('button', { name: /attempt key/i }).click();
    await sleep(350);
  }
  await p.getByText('PARTITION LOCKED', { exact: true }).waitFor();
  await shot(p, 'Partition locked', 'All six attempts used. A countdown shows when the next round opens.');
  await p.getByRole('button', { name: /reset partition/i }).waitFor({ timeout: 15_000 });
  await shot(p, 'Reset available', 'When the countdown ends Jimmy can reset the board without GM help.');
  await p.getByRole('button', { name: /reset partition/i }).click();
  await p.getByRole('group', { name: 'Keyboard' }).waitFor();
  await shot(p, 'Fresh board', 'A clean board with six attempts. The secret does not change.');
  await ctx.close();
  await app.patch((c) => { c.hack.lockoutSeconds = 45; c.hack.mode = 'race'; c.hack.maxAttempts = null; });

  // ============================================================================================
  begin('race', 'Key race against the AI', 'Race mode: each round draws a fresh word from the bank and an AI opponent (Haiku live, a deterministic solver here) guesses on a timer, one attempt every few seconds. Jimmy watches its colour feedback and must find the key first. If the opponent wins, the key rotates after a short lockout.');
  await app.resetGame();
  await app.patch((c) => { c.hack.aiIntervalSeconds = 2; c.hack.aiJitterSeconds = 0; c.hack.lockoutSeconds = 6; c.hack.wordBank = ['CRANE', 'SLATE', 'PLANT']; });
  await app.gmApi('/api/gm/stage', { method: 'POST', json: { stage: 'hack' } });
  ctx = await browser.newContext(phoneOpts);
  p = await ctx.newPage();
  await p.goto(app.base);
  await p.locator('h1', { hasText: 'Brute-force key' }).waitFor();
  await shot(p, 'Race begins', 'Both boards are empty. The adversary panel counts down to its first attempt.');
  await p.getByRole('img', { name: /Adversary attempt 1:/ }).waitFor({ timeout: 15_000 });
  await shot(p, 'The adversary has guessed', 'Its row shows the word it tried and how it scored; the GM can hide the letters and leave the colours.');
  await p.getByText(/race 1 lost/i).first().waitFor({ timeout: 20_000 });
  await shot(p, 'The adversary won the round', 'The banner names the retired key; a new key is issued at once and the next race is already running.');
  await ctx.close();
  await app.patch((c) => { c.hack.aiIntervalSeconds = 10; c.hack.aiJitterSeconds = 5; c.hack.lockoutSeconds = 45; });

  // ============================================================================================
  begin('gm', 'Running the night from the GM console', 'Every control the three GMs have: what the NOW strip shows across a room, skipping and rewinding stages, sealing ARCHIVE, the live log, the danger zone, and the configuration editor.');
  await app.resetGame();
  ctx = await browser.newContext(deskOpts);
  let g = await ctx.newPage();
  await g.goto(`${app.base}/gm`);
  await g.getByLabel('Password').fill('nope');
  await g.getByRole('button', { name: /enter/i }).click();
  await sleep(600);
  await shot(g, 'GM login, wrong password', 'The console sits behind one shared password set in the container environment.', { device: 'desktop', full: false });
  await g.getByLabel('Password').fill('test');
  await g.getByRole('button', { name: /enter/i }).click();
  await g.getByText('GM console').first().waitFor();
  await ctx.close();

  // Stuck alarms: freeze the GM clock, then move it forward.
  await app.resetGame();
  const pc = await browser.newContext(phoneOpts);
  const pp = await pc.newPage();
  await pp.goto(app.base);
  await finishTyping(pp);
  await pp.getByRole('button', { name: /initiate recovery protocol/i }).click();
  await pp.locator('.map').waitFor();
  await app.gmApi('/api/gm/stage', { method: 'POST', json: { stage: 'hack' } });
  await pp.locator('h1', { hasText: 'Brute-force key' }).waitFor();
  await typeWord(pp, 'APPLE');
  await pp.getByRole('button', { name: /attempt key/i }).click();
  ctx = await browser.newContext(deskOpts);
  g = await ctx.newPage();
  autoDialogs(g, 'RESET');
  await g.clock.install();
  await gmLogin(g, app.base);
  await sleep(800);
  await shot(g, 'NOW strip, on track', 'The stage, the time in it, and the last player action, readable from across the table.', { device: 'desktop', full: false });
  await g.clock.fastForward('05:30');
  await sleep(1200);
  await shot(g, 'NOW strip, stuck five minutes', 'Five minutes without progress in a puzzle stage turns the strip amber and makes idle time the big number.', { device: 'desktop', full: false, wait: 0 });
  await g.clock.fastForward('05:00');
  await sleep(1200);
  await shot(g, 'NOW strip, stuck ten minutes', 'At ten minutes it turns red. Time to push a hint.', { device: 'desktop', full: false, wait: 0 });
  await ctx.close();

  ctx = await browser.newContext(deskOpts);
  g = await ctx.newPage();
  autoDialogs(g, 'RESET');
  await gmLogin(g, app.base);
  await sleep(600);
  const quickSend = g.locator('.quick-row').first().getByRole('button', { name: /^send$/i });
  await quickSend.click();
  await pp.getByRole('dialog', { name: /incoming transmission/i }).waitFor({ timeout: 10_000 });
  await finishTyping(pp);
  await shot(g, 'One-tap quick hint', 'Each stage has prewritten hints. SEND pushes one straight to the phone; EDIT loads it into the editor first.', { device: 'desktop', full: false });
  await shot(pp, 'The quick hint on the phone', 'The same transmission overlay as a written hint.', { full: false });
  await pp.getByRole('button', { name: /acknowledge/i }).click();

  await g.getByLabel('Stage to jump to').selectOption('investigation');
  await g.getByRole('button', { name: /unlock \/ skip to/i }).click();
  await pp.getByRole('tab', { name: 'ledger' }).waitFor({ timeout: 10_000 });
  await sleep(600);
  await shot(g, 'Skipping ahead', `Skips ask first: “${lastDialog()}”`, { device: 'desktop', full: false });
  await shot(pp, 'The phone after the skip', 'The phone moves to the new stage straight away.', { full: false });
  await g.getByRole('button', { name: /seal archive/i }).click();
  await pp.getByRole('tab', { name: 'archive' }).click();
  await pp.getByText('ARCHIVE SEALED BY COMMAND AUTHORITY').waitFor({ timeout: 10_000 });
  await shot(pp, 'ARCHIVE sealed', 'The GM can seal ARCHIVE, for example if it starts giving too much away. Unseal restores it.', { full: false });
  await g.getByRole('button', { name: /unseal archive/i }).click();
  await g.getByRole('button', { name: /new archive session/i }).click();
  await sleep(500);
  await g.getByLabel('Stage to reset').selectOption('hack');
  await g.getByRole('button', { name: /^reset stage$/i }).click();
  await sleep(600);
  await shot(g, 'Resetting one stage', `Stage resets explain the consequence first: “${lastDialog()}”`, { device: 'desktop', full: false });
  for (const lane of ['PLAYER', 'GM', 'AI']) {
    await g.locator('.log-filters button', { hasText: new RegExp(`^${lane}$`, 'i') }).click();
    await sleep(250);
    if (lane === 'GM') await shot(g, 'Live log filtered to GM actions', 'The log can be narrowed to player, GM or AI events.', { device: 'desktop', full: false });
  }
  await g.locator('.log-filters button', { hasText: /^all$/i }).click();
  await g.locator('summary', { hasText: 'Danger zone' }).click();
  await shot(g, 'Danger zone', 'Wiping the whole game is tucked away and asks the GM to type RESET. Configuration is kept.', { device: 'desktop', full: false });
  await g.getByRole('button', { name: /reset whole game/i }).click();
  await pp.getByRole('button', { name: /initiate recovery protocol/i }).waitFor({ timeout: 10_000 });
  await finishTyping(pp);
  await shot(pp, 'Back to the start', 'After a whole-game reset the phone returns to the QR landing. Use this after the dry run.', { full: false });
  await ctx.close();
  await pc.close();

  // Config editor
  ctx = await browser.newContext({ ...deskOpts, viewport: { width: 1280, height: 900 } });
  g = await ctx.newPage();
  autoDialogs(g);
  await gmLogin(g, app.base);
  await sleep(600);
  const sections = [
    ['Intro (QR landing)', 'Headline, briefing and button label for the QR landing.'],
    ['Location puzzle (geo)', 'Mode, target pin on a map, radius, Street View start, heading, pitch and walking, photos with upload and delete, and the confirmation text.'],
    ['Code gate (Phil', 'The code Phil reads out on the first call, the prompt, and the success line.'],
    ['The calls', 'The challenge phrase, who makes the second call, and both call scripts, shown in the console for whoever makes them.'],
    ['Word puzzle (Ledger key)', 'The key bank, race pace, attempts and lockout length.'],
    ['Ledger decrypted', 'The notice shown after the puzzle, with the interrogation directive.'],
    ['Surveillance records', 'The section name on the phone and the transmission pushed when it is released.'],
    ['ARCHIVE terminal', 'Welcome line and the model ARCHIVE runs on.'],
    ['Deduction grid', 'The sentence template, each blank’s canonical answer, accepted and rejected phrasings, grader guidance, attempts and feedback mode.'],
    ['Quick hints per stage', 'The one-tap hints for each stage, one per line.'],
  ];
  const unstick = await g.addStyleTag({ content: '.sticky-actions{position:static!important}' });
  for (const [name, note] of sections) {
    const s = g.locator('details.section > summary', { hasText: name }).first();
    await s.click();
    await sleep(500);
    const det = g.locator('details.section', { has: g.locator('summary', { hasText: name }) }).first();
    if (name.startsWith('Deduction')) { const slot = det.locator('summary', { hasText: 'suspect' }).first(); if (await slot.count()) await slot.click(); }
    await det.scrollIntoViewIfNeeded();
    await sleep(name.startsWith('Location') ? 2500 : 300);
    const file = `${String(++n).padStart(3, '0')}-${journey.id}.jpg`;
    await det.screenshot({ path: path.join(out, 'shots', file), type: 'jpeg', quality: 78 });
    journey.steps.push({ title: `Config: ${name.replace(/ \(.*$/, '').replace(/ \(Phil$/, '')}`, note, file, device: 'desktop' });
    console.log('  shot', file, name);
    await s.click();
  }
  await unstick.evaluate((el) => el.remove());
  await g.locator('details.section > summary', { hasText: 'Code gate' }).first().click();
  const codeInput = g.locator('details.section', { has: g.locator('summary', { hasText: 'Code gate' }) }).locator('input').nth(0);
  await codeInput.fill('S30GHOST2');
  const other = await (await browser.newContext(deskOpts)).newPage();
  await gmLogin(other, app.base);
  await app.patch((c) => { c.archive.welcome = c.archive.welcome + ' '; });
  await sleep(1500);
  await shot(g, 'Two GMs editing at once', 'If another GM saves while you have unsaved edits, the editor says so and blocks the overwrite until you discard.', { device: 'desktop', full: false });
  await g.getByRole('button', { name: /^discard$/i }).click();
  await other.context().close();
  await ctx.close();

  // GM on a phone
  ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  g = await ctx.newPage();
  await gmLogin(g, app.base);
  await sleep(800);
  await shot(g, 'GM console on a phone', 'At dinner the GMs can run everything from a phone. Hints come first, then progress and the log.', { device: 'phone' });
  await ctx.close();

  // ============================================================================================
  begin('edge', 'Access and connection problems', 'What the player and the GMs see when the link is wrong or the connection drops.');
  const keyed = await startServer({ PLAYER_KEY: 'jimmy30' });
  ctx = await browser.newContext(phoneOpts);
  p = await ctx.newPage();
  await p.goto(keyed.base);
  await p.getByText('Access denied').first().waitFor({ timeout: 10_000 });
  await shot(p, 'Link without the key', 'With PLAYER_KEY set, only the QR link that carries the key opens the game. Anyone else sees this.', { full: false });
  await p.goto(`${keyed.base}/?k=jimmy30`);
  await p.getByRole('button', { name: /initiate recovery protocol/i }).waitFor();
  await finishTyping(p);
  await shot(p, 'Link with the key', 'The key is stored in a cookie, so reloads and later visits keep working.', { full: false });
  await ctx.close();
  keyed.server.kill('SIGTERM');

  ctx = await browser.newContext(phoneOpts);
  p = await ctx.newPage();
  await p.routeWebSocket(/\/ws/, (ws) => ws.close({ code: 1011 }));
  await p.goto(app.base);
  await p.getByText(/Link lost/).waitFor({ timeout: 12_000 });
  await finishTyping(p);
  await shot(p, 'Player connection lost', 'Without the live connection the phone polls every ten seconds and says so after five. Play continues.', { full: false });
  await ctx.close();
  ctx = await browser.newContext(deskOpts);
  g = await ctx.newPage();
  await g.routeWebSocket(/\/ws/, (ws) => ws.close({ code: 1011 }));
  await gmLogin(g, app.base);
  await g.getByText(/Link down/).waitFor({ timeout: 12_000 });
  await shot(g, 'GM connection lost', 'The console warns that the player keeps playing while the GMs are not seeing it, and polls until the link returns.', { device: 'desktop', full: false });
  await ctx.close();
} finally {
  await browser.close();
  servers.forEach((s) => s.kill('SIGTERM'));
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(path.join(out, 'raw'), { recursive: true, force: true });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
console.log(`\ndone: ${n} shots, ${manifest.journeys.reduce((a, j) => a + j.videos.length, 0)} videos in ${out}`);
