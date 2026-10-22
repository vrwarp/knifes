import type { Page, WebSocketRoute } from '@playwright/test';
import { GM_PASSWORD, expect, startGame, test, typeWord } from './fixtures';

// The live link on the night: the phone sleeps in a pocket, walks from Wi-Fi onto cellular, comes back.
// The server heartbeats every second here, so a silent link is caught in seconds rather than a minute.
test.use({ serverEnv: { WS_HEARTBEAT_MS: '1000' } });

type Link = { quiet: boolean; relayed: number; route: WebSocketRoute };

/** Puts the test between the page and the server: each connection can be silenced (open, delivering nothing). */
async function tapLinks(page: Page, role: 'player' | 'gm', refuse = () => false) {
  const links: Link[] = [];
  await page.routeWebSocket(new RegExp(`/ws\\?role=${role}$`), (ws) => {
    if (refuse()) {
      ws.close({ code: 1011, reason: 'no network' });
      return;
    }
    const link: Link = { quiet: false, relayed: 0, route: ws };
    links.push(link);
    const server = ws.connectToServer();
    server.onMessage((m) => {
      if (link.quiet) return;
      ws.send(m);
      link.relayed++;
    });
  });
  return links;
}

/** Waits until the newest link has delivered the heartbeat and the state, then silences every link so far. */
async function silence(links: Link[]) {
  await expect.poll(() => links.at(-1)?.relayed ?? 0).toBeGreaterThanOrEqual(2);
  for (const l of links) l.quiet = true;
}

const overview = async (app: { gmApi: (p: string) => Promise<Response> }) => (await (await app.gmApi('/api/gm/overview')).json()) as { state: Record<string, any> };

test('a phone link that goes silent without closing is redialed, and what the GMs sent meanwhile arrives', async ({ player, app }) => {
  const links = await tapLinks(player, 'player');
  await app.setStage('investigation');
  await player.goto(app.base);
  await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
  // No refresh of its own still in flight, so the transmission can only come through a redial.
  await player.waitForLoadState('networkidle');
  // The socket stays open on the phone and delivers nothing: what a dead network path looks like from inside.
  await silence(links);
  await app.gmApi('/api/gm/hint', { json: { text: 'Through the silence.' } });
  await expect(player.getByRole('dialog', { name: /incoming transmission/i })).toContainText('Through the silence.', { timeout: 15_000 });
  await expect.poll(() => links.length, { message: 'the phone dialed a new link' }).toBeGreaterThan(1);
  // And the new link is live: the release comes through it.
  await player.getByRole('dialog', { name: /incoming transmission/i }).getByRole('button', { name: /acknowledge/i }).click();
  await app.gmApi('/api/gm/ledger/release', { json: { released: true } });
  await expect(player.getByRole('dialog', { name: /incoming transmission/i })).toContainText('SECOND AUTHORIZATION RECEIVED');
});

test('the console redials a silent link too, and sees the phone move', async ({ gmContext, player, app }) => {
  const gm = await gmContext.newPage();
  const links = await tapLinks(gm, 'gm');
  await gm.goto(`${app.base}/gm`);
  await expect(gm.getByText('GM console').first()).toBeVisible();
  await silence(links);
  await startGame(player, app.base);
  await expect(gm.locator('.chip.now', { hasText: /field transmission/i })).toBeVisible({ timeout: 15_000 });
});

test('a link that drops mid-race and stays down: guesses still go through, and the race is current when it is back', async ({ player, app }) => {
  await app.patch((c) => {
    Object.assign(c.hack, { mode: 'race', wordBank: ['CRANE', 'SLATE', 'PLANT'], aiPlanGuesses: 12, aiPlanJitter: 0, aiIntervalSeconds: 1.5, aiJitterSeconds: 0, freePass: { enabled: false, text: '' } });
  });
  await app.setStage('hack');
  let down = false;
  const links = await tapLinks(player, 'player', () => down);
  await player.goto(app.base);
  await expect(player.getByRole('img', { name: /^Adversary attempt 1:/ })).toBeVisible({ timeout: 8000 });

  down = true;
  await links.at(-1)!.route.close({ code: 1011, reason: 'no network' });
  // His guesses travel over plain requests, link or no link.
  await typeWord(player, 'BRICK');
  await player.getByRole('button', { name: /attempt key/i }).click();
  await expect(player.getByRole('img', { name: /^Attempt 1: B / })).toBeVisible();
  await expect(player.getByText(/Link lost/)).toBeVisible({ timeout: 12_000 });

  const count = links.length;
  down = false;
  await expect.poll(() => links.length, { timeout: 20_000 }).toBeGreaterThan(count);
  await expect(player.getByText(/Link lost/)).toHaveCount(0);
  const { state } = await overview(app);
  if (state.stage === 'hack' && state.hack.round === 1) {
    await expect.poll(async () => player.getByRole('img', { name: /^Adversary attempt/ }).count()).toBeGreaterThanOrEqual(state.hack.ai.guesses.length);
  }
  await app.gmApi('/api/gm/hint', { json: { text: 'Back on the line.' } });
  await expect(player.getByRole('dialog', { name: /incoming transmission/i })).toContainText('Back on the line.');
});

test('the reverse proxy’s own error page while the container restarts reads as no answer, not Bad Gateway', async ({ player, app }) => {
  await app.setStage('investigation');
  await player.goto(app.base);
  await player.getByRole('tab', { name: 'archive' }).click();
  const nginx = '<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>';
  await player.route('**/api/player/archive', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 502, contentType: 'text/html', body: nginx }) : r.continue()));
  await player.getByLabel('Query').fill('anyone there');
  await player.getByRole('button', { name: /send/i }).click();
  await expect(player.getByRole('alert')).toHaveText('No answer from the server. Check the link and retry.');
  // The question is still in the box; once the container is back, the same tap sends it.
  await player.unroute('**/api/player/archive');
  await player.getByRole('button', { name: /send/i }).click();
  await expect(player.getByText('anyone there', { exact: true })).toBeVisible();
  await expect(player.getByRole('alert')).toHaveCount(0);
});

test('a console whose login is gone goes back to the password form at its next request, says why, and picks up again', async ({ gm, gmContext, player, app }) => {
  // The browser drops the login (a cleared site, a privacy setting) while the live link stays up.
  await gm.waitForLoadState('networkidle');
  await gmContext.clearCookies();
  await gm.getByLabel('Transmission text').fill('Check the badge log.');
  await gm.getByRole('button', { name: /push to his screen/i }).click();
  await expect(gm.getByText('Your login is no longer valid. Enter the password again.')).toBeVisible();
  expect((await overview(app)).state.hints, 'nothing went out without a login').toHaveLength(0);
  await gm.getByLabel('Password').fill(GM_PASSWORD);
  await gm.getByRole('button', { name: /enter/i }).click();
  await expect(gm.getByText('GM console').first()).toBeVisible();
  // Live again: the console follows the phone without a reload.
  await startGame(player, app.base);
  await expect(gm.locator('.chip.now', { hasText: /field transmission/i })).toBeVisible({ timeout: 15_000 });
});

test('a console whose login is gone finds out by itself when its link drops, with nobody pressing anything', async ({ gm, gmContext, app }) => {
  await gm.waitForLoadState('networkidle');
  await gmContext.clearCookies();
  await app.restart();
  await expect(gm.getByText('Your login is no longer valid. Enter the password again.')).toBeVisible({ timeout: 25_000 });
});

test('an ARCHIVE answer that never made it back, its link silent too, is on the phone once the link is back', async ({ player, app }) => {
  const links = await tapLinks(player, 'player');
  await app.setStage('investigation');
  await player.goto(app.base);
  await player.getByRole('tab', { name: 'archive' }).click();
  await player.waitForLoadState('networkidle');
  await silence(links);
  // The question reaches the server and is answered there, but the reply never reaches the phone: the request just hangs.
  let reached = false;
  await player.route('**/api/player/archive', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    await r.fetch();
    reached = true;
  });
  await player.getByLabel('Query').fill('list the agents');
  await player.getByRole('button', { name: /send/i }).click();
  await expect.poll(() => reached).toBe(true);
  // The silent link is redialed, and the transcript comes back with it: question and answer, once each.
  await expect(player.locator('.msg.assistant').last()).toContainText('Personnel files', { timeout: 15_000 });
  await expect(player.getByText('list the agents', { exact: true })).toHaveCount(1);
  // Nor is the phone left waiting on a reply that will never come.
  await expect(player.locator('.msg.system.cursor')).toHaveCount(0);
  await expect(player.getByRole('alert')).toHaveCount(0);
  await player.getByLabel('Query').fill('tell me about nina');
  await expect(player.getByRole('button', { name: /send/i })).toBeEnabled();
});
