import { RIGHT_ANSWERS, expect, fillDeduction, finishBeats, finishTyping, noHorizontalScroll, startGame, test, typeWord } from './fixtures';

test.describe('player journey', () => {
  test('plays the whole game from the QR landing to the case file', async ({ player, app }) => {
    await app.patch((c) => {
      c.hack.mode = 'solo';
      c.hack.secret = 'ALPHA';
    });
    await player.goto(app.base);
    await expect(player.locator('h1', { hasText: 'MAGENTA CHANNEL' })).toBeVisible();
    const start = player.getByRole('button', { name: /initiate recovery protocol/i });
    await expect(start, 'start waits for the briefing to finish typing').toBeDisabled();
    await finishTyping(player);
    await expect(start).toBeEnabled();
    await noHorizontalScroll(player);
    await start.click();

    // Location puzzle (no target configured: any pin is accepted).
    await expect(player.locator('h1', { hasText: 'Field transmission' })).toBeVisible();
    await player.getByRole('button', { name: /tap to unlock map/i }).click();
    await player.locator('.map').click({ position: { x: 120, y: 120 } });
    await player.getByRole('button', { name: /triangulate/i }).click();
    await expect(player.getByText('LOCATION CONFIRMED')).toBeVisible();
    await noHorizontalScroll(player);
    await player.getByRole('button', { name: /proceed/i }).click();

    // Code gate.
    await expect(player.locator('h1', { hasText: 'Secure line' })).toBeVisible();
    await player.getByLabel('Recovery key').fill('WRONGKEY');
    await player.getByRole('button', { name: /submit key/i }).click();
    await expect(player.getByText('KEY REJECTED')).toBeVisible();
    await player.getByLabel('Recovery key').fill('magenta-30');
    await player.getByRole('button', { name: /submit key/i }).click();
    await expect(player.getByText('Recovery key accepted')).toBeVisible();

    // Word puzzle.
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
    await typeWord(player, 'apple');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByRole('img', { name: /Attempt 1: A placed, P absent, P placed, L misplaced, E absent/ })).toBeVisible();
    await typeWord(player, 'ALPHA');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByText('KEY ACCEPTED')).toBeVisible();

    // Reveal.
    await expect(player.locator('h1', { hasText: 'INCIDENT RECORD' })).toBeVisible();
    await finishTyping(player);
    await noHorizontalScroll(player);
    await player.getByRole('button', { name: /return to base/i }).click();

    // Investigation.
    await expect(player.getByRole('tab', { name: 'evidence' })).toBeVisible();
    await player.getByRole('tab', { name: 'deduction' }).click();
    await fillDeduction(player, { ...RIGHT_ANSWERS, SUSPECT: 'Agent Cipher' });
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await expect(player.getByText(/DEDUCTION REJECTED/)).toBeVisible({ timeout: 15_000 });
    await expect(player.getByText(/FIELDS VERIFIED/), 'pass/fail mode never says which field is wrong').toHaveCount(0);
    await fillDeduction(player, { SUSPECT: 'Agent Vector' });
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await expect(player.locator('h1', { hasText: 'DEDUCTION VERIFIED' }).first()).toBeVisible({ timeout: 15_000 });
    await finishBeats(player);
    await expect(player.locator('pre.typed:not(.ghost)', { hasText: 'Happy thirtieth, Detective' })).toBeVisible();

    // Case file published by the GM.
    await app.gmApi('/api/gm/report/generate', { method: 'POST' });
    await app.gmApi('/api/gm/report/publish', { json: { published: true } });
    await expect(player.getByText('CASE FILE 30-0415').first()).toBeVisible();
    await noHorizontalScroll(player);
  });

  test('progress survives a reload mid-game', async ({ player, app }) => {
    await startGame(player, app.base);
    await app.setStage('hack');
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
    await typeWord(player, 'PLANTER');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByRole('img', { name: /Attempt 1:/ })).toBeVisible();
    await player.reload();
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
    await expect(player.getByRole('img', { name: /Attempt 1: P/ })).toBeVisible();
    await expect(player.getByText(/You · 1/)).toBeVisible();
  });

  test('the player API never leaks answers', async ({ app, request }) => {
    for (const stage of ['intro', 'gate', 'hack', 'investigation']) {
      await app.setStage(stage);
      const text = await (await request.get(`${app.base}/api/player/state`)).text();
      for (const secret of ['MAGENTA30', 'CANIS30', '"ALPHA"', 'Agent Vector', 'canonical', 'guidance']) {
        expect(text, `${secret} leaked at ${stage}`).not.toContain(secret);
      }
      if (stage === 'hack') {
        const { state } = await (await app.gmApi('/api/gm/overview')).json();
        expect(state.hack.secret, 'a race word was drawn').toMatch(/^[A-Z]{7}$/);
        expect(text, `the drawn key ${state.hack.secret} leaked`).not.toContain(state.hack.secret);
        expect(text, 'the word bank leaked').not.toContain('wordBank');
      }
    }
  });
});
