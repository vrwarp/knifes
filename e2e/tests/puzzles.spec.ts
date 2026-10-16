import { expect, finishTyping, startGame, test } from './fixtures';

test.describe('code gate', () => {
  test('ignores case and dashes, and keeps the rejection until the next attempt', async ({ player, app }) => {
    await app.patch((c) => (c.geo.mode = 'off'));
    await startGame(player, app.base);
    await finishTyping(player);
    const key = player.getByLabel('Recovery key');
    await key.fill('nope');
    await player.getByRole('button', { name: /submit key/i }).click();
    await expect(player.getByText('KEY REJECTED')).toBeVisible();
    await player.waitForTimeout(1500);
    await expect(player.getByText('KEY REJECTED'), 'the rejection does not vanish on its own').toBeVisible();
    await key.fill('Magenta-30');
    await player.getByRole('button', { name: /submit key/i }).click();
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
  });
});

test.describe('word puzzle', () => {
  test.beforeEach(async ({ player, app }) => {
    await app.patch((c) => (c.hack.lockoutSeconds = 3));
    await app.setStage('hack');
    await player.goto(app.base);
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
  });

  test('scores letters and labels each row for screen readers', async ({ player }) => {
    await player.getByLabel('Key attempt').fill('LAPAH');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByRole('img', { name: 'Attempt 1: L misplaced, A misplaced, P placed, A misplaced, H misplaced' })).toBeVisible();
  });

  test('rejects words that are not five letters', async ({ player }) => {
    await player.getByLabel('Key attempt').fill('ABC');
    await expect(player.getByRole('button', { name: /attempt key/i })).toBeDisabled();
  });

  test('six misses lock the partition, then the player can reset it', async ({ player }) => {
    for (const w of ['BRICK', 'STORM', 'QUEST', 'ZEBRA', 'MOUND', 'CHILI']) {
      await player.getByLabel('Key attempt').fill(w);
      await player.getByRole('button', { name: /attempt key/i }).click();
      await expect(player.getByRole('img', { name: new RegExp(`: ${w[0]} `) })).toBeVisible();
    }
    await expect(player.getByText('PARTITION LOCKED', { exact: true })).toBeVisible();
    await player.getByRole('button', { name: /reset partition/i }).click({ timeout: 15_000 });
    await expect(player.getByLabel('Key attempt')).toBeVisible();
    await expect(player.getByRole('img', { name: /Attempt 1:/ })).toHaveCount(0);
    await player.getByLabel('Key attempt').fill('ALPHA');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByText('KEY ACCEPTED')).toBeVisible();
  });
});
