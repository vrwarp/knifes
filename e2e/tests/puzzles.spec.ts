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
    await app.patch((c) => {
      c.hack.lockoutSeconds = 3;
      c.hack.mode = 'solo';
    });
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

test.describe('key race', () => {
  test.beforeEach(async ({ app }) => {
    await app.patch((c) => {
      c.hack.mode = 'race';
      c.hack.lockoutSeconds = 2;
      c.hack.aiIntervalSeconds = 1.5;
      c.hack.aiJitterSeconds = 0;
      c.hack.wordBank = ['CRANE', 'SLATE'];
    });
    await app.setStage('hack');
  });

  test('shows the adversary guessing on the clock, colours only, and the player can still win', async ({ player, app }) => {
    await player.goto(app.base);
    await expect(player.getByText(/Adversary · 0\/6/)).toBeVisible();
    const { state } = await (await app.gmApi('/api/gm/overview')).json();
    const key = state.hack.secret as string;
    expect(['CRANE', 'SLATE']).toContain(key);
    const other = key === 'CRANE' ? 'SLATE' : 'CRANE';
    // Jimmy misses once; the player's own row keeps its letters.
    await player.getByLabel('Key attempt').fill(other);
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByRole('img', { name: new RegExp(`^Attempt 1: ${other[0]} `) })).toBeVisible();
    // The adversary's first attempt lands within its interval, without letters.
    const advRow = player.getByRole('img', { name: /^Adversary attempt 1:/ });
    await expect(advRow).toBeVisible({ timeout: 8000 });
    await expect(advRow).not.toHaveAttribute('aria-label', /[A-Z] (placed|misplaced|absent)/);
    expect(await (await app.gmApi('/api/gm/overview')).json().then((o) => o.state.hack.ai.guesses)).toEqual(['CRANE']);
    if (key === 'SLATE') {
      // CRANE missed; Jimmy types the key before the adversary's second attempt.
      await player.getByLabel('Key attempt').fill(key);
      await player.getByRole('button', { name: /attempt key/i }).click();
      await expect(player.getByText('KEY ACCEPTED')).toBeVisible();
      await expect(player.getByText(/ADVERSARY BEATEN/)).toBeVisible();
    } else {
      await expect(player.getByText('ADVERSARY RECOVERED THE KEY FIRST')).toBeVisible();
    }
  });

  test('when the adversary wins, the key is shown, the partition locks, and a new race starts', async ({ player, app }) => {
    await player.goto(app.base);
    const before = (await (await app.gmApi('/api/gm/overview')).json()).state.hack.secret as string;
    await expect(player.getByText('ADVERSARY RECOVERED THE KEY FIRST')).toBeVisible({ timeout: 12_000 });
    await expect(player.getByText(`the key was`)).toContainText(before);
    await player.getByRole('button', { name: /start next race/i }).click({ timeout: 10_000 });
    await expect(player.getByRole('img', { name: /^Adversary attempt/ })).toHaveCount(0);
    const after = (await (await app.gmApi('/api/gm/overview')).json()).state.hack;
    expect(after.round).toBe(2);
    expect(after.secret).not.toBe(before);
    expect(after.rounds).toBe(1);
  });

  test('the GM console shows the drawn key and the adversary log', async ({ gm, app }) => {
    await expect(gm.getByText(/key [A-Z]{5}/).first()).toBeVisible();
    await expect(gm.locator('.log', { hasText: /adversary [A-Z]{5}/ }).first()).toBeVisible({ timeout: 10_000 });
    const { state } = await (await app.gmApi('/api/gm/overview')).json();
    expect(state.hack.ai.guesses.length).toBeGreaterThan(0);
  });
});
