import { clearWord, expect, finishTyping, startGame, test, typeWord } from './fixtures';

test.describe('code gate', () => {
  test('rejects a wrong key, keeps the rejection until the next attempt, and accepts the code', async ({ player, app }) => {
    await app.patch((c) => (c.geo.mode = 'off'));
    await startGame(player, app.base);
    await finishTyping(player);
    await typeWord(player, 'nope');
    await player.getByRole('button', { name: /submit key/i }).click();
    await expect(player.getByText('KEY REJECTED')).toBeVisible();
    await player.waitForTimeout(1500);
    await expect(player.getByText('KEY REJECTED'), 'the rejection does not vanish on its own').toBeVisible();
    await key.fill('S30-ghost');
    await player.getByRole('button', { name: /submit key/i }).click();
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
  });
});

test.describe('word puzzle', () => {
  test.beforeEach(async ({ player, app }) => {
    await app.patch((c) => {
      c.hack.lockoutSeconds = 3;
      c.hack.mode = 'solo';
      c.hack.secret = 'ALPHA';
      c.hack.maxAttempts = 6;
    });
    await app.setStage('hack');
    await player.goto(app.base);
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
  });

  test('scores letters and labels each row for screen readers', async ({ player }) => {
    await typeWord(player, 'LAPAH');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByRole('img', { name: 'Attempt 1: L misplaced, A misplaced, P placed, A misplaced, H misplaced' })).toBeVisible();
  });

  test('rejects words that are not five letters', async ({ player }) => {
    await typeWord(player, 'ABC');
    await expect(player.getByRole('button', { name: /attempt key/i })).toBeDisabled();
  });

  test('six misses lock the partition, then the player can reset it', async ({ player }) => {
    for (const w of ['BRICK', 'STORM', 'QUEST', 'ZEBRA', 'MOUND', 'CHILI']) {
      await typeWord(player, w);
      await player.getByRole('button', { name: /attempt key/i }).click();
      await expect(player.getByRole('img', { name: new RegExp(`: ${w[0]} `) })).toBeVisible();
    }
    await expect(player.getByText('PARTITION LOCKED', { exact: true })).toBeVisible();
    await player.getByRole('button', { name: /reset partition/i }).click({ timeout: 15_000 });
    await expect(player.getByRole('group', { name: 'Keyboard' })).toBeVisible();
    await expect(player.getByRole('img', { name: /Attempt 1:/ })).toHaveCount(0);
    await typeWord(player, 'ALPHA');
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
      // Short scripts keep these tests quick: the adversary takes the key on its fourth tick.
      c.hack.aiPlanGuesses = 4;
      c.hack.aiPlanJitter = 0;
    });
    await app.setStage('hack');
  });

  test('shows the adversary guessing on the clock, with its letters, and the player can still win', async ({ player, app }) => {
    await player.goto(app.base);
    await expect(player.getByText(/Adversary · 0/)).toBeVisible();
    const { state } = await (await app.gmApi('/api/gm/overview')).json();
    const key = state.hack.secret as string;
    expect(['CRANE', 'SLATE']).toContain(key);
    const other = key === 'CRANE' ? 'SLATE' : 'CRANE';
    // Jimmy misses once on the on-screen keyboard; his row keeps its letters.
    await typeWord(player, other);
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByRole('img', { name: new RegExp(`^Attempt 1: ${other[0]} `) })).toBeVisible();
    // The adversary's first attempt lands within its interval, letters included.
    const advRow = player.getByRole('img', { name: /^Adversary attempt 1:/ });
    await expect(advRow).toBeVisible({ timeout: 8000 });
    await expect(advRow).toHaveAttribute('aria-label', /[A-Z] (placed|misplaced|absent)/);
    // Jimmy types the key before the script reaches it.
    await typeWord(player, key);
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByText('KEY ACCEPTED')).toBeVisible();
    await expect(player.getByText(/beaten at/i)).toBeVisible();
  });

  test('hides the adversary letters when the GM turns them off', async ({ player, app }) => {
    await app.patch((c) => (c.hack.aiShowLetters = false));
    await player.goto(app.base);
    const advRow = player.getByRole('img', { name: /^Adversary attempt 1:/ });
    await expect(advRow).toBeVisible({ timeout: 8000 });
    await expect(advRow).not.toHaveAttribute('aria-label', /[A-Z] (placed|misplaced|absent)/);
  });

  test('when the adversary wins, the next race starts at once with a banner for the lost one', async ({ player, app }) => {
    await player.goto(app.base);
    const before = (await (await app.gmApi('/api/gm/overview')).json()).state.hack.secret as string;
    const banner = player.getByRole('status').filter({ hasText: /race 1 lost/i });
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText(`adversary took ${before}`);
    await expect(banner).toContainText('new key issued');
    // Boards are clear and the keyboard is live: no lockout, no button to press.
    await expect(player.getByRole('img', { name: /^Adversary attempt/ })).toHaveCount(0);
    await expect(player.getByRole('group', { name: 'Keyboard' })).toBeVisible();
    await expect(player.getByText('PARTITION LOCKED')).toHaveCount(0);
    const after = (await (await app.gmApi('/api/gm/overview')).json()).state.hack;
    expect(after.round).toBe(2);
    expect(after.secret).not.toBe(before);
    expect(after.rounds).toBe(1);
    expect(after.lockedUntil).toBeNull();
  });

  test('when the adversary has taken every key, Jimmy gets the free pass and moves on', async ({ player, app }) => {
    await app.patch((c) => {
      c.hack.aiPlanGuesses = 2;
      c.hack.aiPlanJitter = 0;
      c.hack.freePass = { enabled: true, text: 'FAILSAFE TRIGGERED. KEY RELEASED.' };
    });
    await app.setStage('hack');
    await player.goto(app.base);
    await expect(player.getByText('FAILSAFE TRIGGERED. KEY RELEASED.')).toBeVisible({ timeout: 25_000 });
    await expect(player.locator('h1', { hasText: 'INCIDENT RECORD' })).toBeVisible({ timeout: 15_000 });
    const { state } = await (await app.gmApi('/api/gm/overview')).json();
    expect(state.hack.freePass).toBe(true);
    expect(state.hack.rounds).toBe(2);
  });

  test('the GM console shows the drawn key and the adversary log', async ({ gm, app }) => {
    await expect(gm.getByText(/key [A-Z]{5}/).first()).toBeVisible();
    await expect(gm.locator('.log', { hasText: /adversary [A-Z]{5}/ }).first()).toBeVisible({ timeout: 10_000 });
    const { state } = await (await app.gmApi('/api/gm/overview')).json();
    // With a two-word bank the first guess may already have won and rolled into round two.
    expect(state.hack.ai.guesses.length + state.hack.rounds).toBeGreaterThan(0);
  });
});
