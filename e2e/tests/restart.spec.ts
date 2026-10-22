import type { Locator, Page } from '@playwright/test';
import { LIVE_AI, expect, finishTyping, test, typeWord } from './fixtures';

// The container can die on the night (out of memory, a host reboot, a `docker restart`) with the phone and
// the consoles open. Everything they hold has to come back with it: the game, the phone's key, the GM login,
// the live links. With the player key on and the AI live, as at the party.
test.use({ serverEnv: { ...LIVE_AI, PLAYER_KEY: 'jimmy30', WS_HEARTBEAT_MS: '1000' } });

const qr = (base: string) => `${base}/?k=jimmy30`;
const overview = async (app: { gmApi: (p: string) => Promise<Response> }) => (await (await app.gmApi('/api/gm/overview')).json()) as { state: Record<string, any> };

const SCREENS: [string, (p: Page) => Locator][] = [
  ['intro', (p) => p.getByRole('button', { name: /initiate recovery protocol/i })],
  ['geo', (p) => p.getByRole('button', { name: /tap to unlock map/i })],
  ['gate', (p) => p.locator('h1', { hasText: 'Secure line' })],
  ['hack', (p) => p.locator('h1', { hasText: 'Brute-force key' })],
  ['reveal', (p) => p.locator('h1', { hasText: 'LEDGER DECRYPTED' })],
  ['investigation', (p) => p.getByRole('tab', { name: 'ledger' })],
];

test('a crash mid-race: the phone keeps its board, the server comes back with the same key, and the race goes on', async ({ player, gm, app }) => {
  await app.patch((c) => Object.assign(c.hack, { mode: 'race', aiIntervalSeconds: 600, aiJitterSeconds: 0 }));
  await app.setStage('hack');
  await player.goto(qr(app.base));
  await typeWord(player, 'PLANTER');
  await player.getByRole('button', { name: /attempt key/i }).click();
  await expect(player.getByRole('img', { name: /^Attempt 1: P / })).toBeVisible();
  const before = (await overview(app)).state.hack;

  await app.restart();
  await expect(player.getByRole('img', { name: /^Attempt 1: P / })).toBeVisible();
  await typeWord(player, 'CHAPTER');
  await player.getByRole('button', { name: /attempt key/i }).click();
  await expect(player.getByRole('img', { name: /^Attempt 2: C / })).toBeVisible();
  const after = (await overview(app)).state.hack;
  expect(after.secret).toBe(before.secret);
  expect(after.round).toBe(before.round);
  expect(after.guesses).toEqual(['PLANTER', 'CHAPTER']);
  // The console was never reloaded: its link came back by itself and it follows the phone.
  await expect(gm.getByText(/Jimmy PLANTER, CHAPTER/)).toBeVisible({ timeout: 15_000 });
  await expect(gm.getByText(/Link down/)).toHaveCount(0);
});

test('a docker restart (SIGTERM) in the interrogation: the console pushes a transmission without logging in again', async ({ player, gm, app }) => {
  await app.setStage('investigation');
  await player.goto(qr(app.base));
  await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
  await app.restart('SIGTERM');
  await gm.getByLabel('Transmission text').fill('After the restart.');
  await gm.getByRole('button', { name: /push to his screen/i }).click();
  await expect(player.getByRole('dialog', { name: /incoming transmission/i })).toContainText('After the restart.', { timeout: 15_000 });
  // The phone's key outlived the server too: a plain reload, no ?k=, still opens the game.
  await player.goto(app.base);
  await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
  await expect(player.getByText(/access denied/i)).toHaveCount(0);
});

test('a crash while the ARCHIVE is answering: he is told, and the ARCHIVE is free for his next question', async ({ player, app }) => {
  await app.setStage('investigation');
  await player.goto(qr(app.base));
  await player.getByRole('tab', { name: 'archive' }).click();
  app.scenario({ default: { delayMs: 30_000, text: 'NEVER ARRIVES' } });
  await player.getByLabel('Query').fill('who was in the office');
  await player.getByRole('button', { name: /send/i }).click();
  await expect(player.getByRole('button', { name: /send/i })).toBeDisabled();
  await expect.poll(async () => (await overview(app)).state.archive.busy).toBe(true);
  await app.restart();
  await expect(player.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  expect((await overview(app)).state.archive.busy).toBe(false);
  app.scenario({ default: { text: 'ARCHIVE: back online.' } });
  await player.getByLabel('Query').fill('who was in the office');
  await player.getByRole('button', { name: /send/i }).click();
  await expect(player.locator('.msg.assistant').last()).toContainText('ARCHIVE: back online.');
  await expect(player.getByRole('alert')).toHaveCount(0);
});

test('a crash at every stage puts the phone back on the same screen', async ({ player, app }) => {
  test.setTimeout(120_000);
  await player.goto(qr(app.base));
  for (const [stage, screen] of SCREENS) {
    await app.setStage(stage);
    await finishTyping(player);
    await expect(screen(player), `${stage} before`).toBeVisible();
    await app.restart();
    await player.reload();
    await expect(screen(player), `${stage} after the crash`).toBeVisible();
    expect((await overview(app)).state.stage).toBe(stage);
  }
});
