import { expect, finishTyping, test } from './fixtures';

// A server started with PLAYER_KEY: only the QR link carrying the key opens the game.
test.use({ serverEnv: { PLAYER_KEY: 'jimmy30' } });

test.describe('player key', () => {
  test('the link without the key is refused; the QR link with it works and is remembered', async ({ player, app }) => {
    await player.goto(app.base);
    await expect(player.getByText('Access denied')).toBeVisible();
    await player.goto(`${app.base}/?k=wrong`);
    await expect(player.getByText('Access denied')).toBeVisible();
    await player.goto(`${app.base}/?k=jimmy30`);
    await expect(player.getByRole('button', { name: /initiate recovery protocol/i })).toBeVisible();
    await player.goto(app.base);
    await finishTyping(player);
    await expect(player.getByRole('button', { name: /initiate recovery protocol/i })).toBeEnabled();
  });

  test('the player API refuses requests without the key', async ({ app, request }) => {
    expect((await request.get(`${app.base}/api/player/state`)).status()).toBe(401);
  });
});

