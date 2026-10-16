import { expect, finishTyping, startGame, test } from './fixtures';

test.describe('location stage', () => {
  test('map starts locked and unlocks on tap', async ({ player, app }) => {
    await startGame(player, app.base);
    const unlock = player.getByRole('button', { name: /tap to unlock map/i });
    await expect(unlock).toBeVisible();
    await expect(player.getByRole('button', { name: /triangulate/i })).toBeDisabled();
    await unlock.click();
    await expect(player.getByRole('button', { name: /lock map/i })).toBeVisible();
    await player.getByRole('button', { name: /lock map/i }).click();
    await expect(unlock).toBeVisible();
  });

  test('a pin outside the radius reports the distance; a pin inside solves it', async ({ player, app }) => {
    const c = await app.config();
    // Target the map's own starting centre so a tap in the middle of the map lands on it.
    await app.patch((cfg) => {
      cfg.geo.target = { ...c.geo.mapCenter };
      cfg.geo.radiusMeters = 3000;
    });
    await startGame(player, app.base);
    await player.getByRole('button', { name: /tap to unlock map/i }).click();
    const map = player.locator('.map');
    await map.click({ position: { x: 4, y: 4 } });
    await player.getByRole('button', { name: /triangulate/i }).click();
    await expect(player.getByText(/SIGNAL MISMATCH\. Marker is .* from the source/)).toBeVisible();
    const box = (await map.boundingBox())!;
    await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await player.getByRole('button', { name: /triangulate/i }).click();
    await expect(player.getByText('LOCATION CONFIRMED')).toBeVisible();
  });

  test('reveal-only mode skips the puzzle', async ({ player, app }) => {
    await app.patch((c) => (c.geo.mode = 'reveal'));
    await startGame(player, app.base);
    await finishTyping(player);
    await expect(player.getByText('LOCATION CONFIRMED')).toBeVisible();
    await expect(player.locator('.map')).toHaveCount(0);
    await player.getByRole('button', { name: /proceed/i }).click();
    await expect(player.locator('h1', { hasText: 'Secure line' })).toBeVisible();
  });

  test('off mode goes straight from the intro to the code gate', async ({ player, app }) => {
    await app.patch((c) => (c.geo.mode = 'off'));
    await startGame(player, app.base);
    await expect(player.locator('h1', { hasText: 'Secure line' })).toBeVisible();
  });

  test('field photos open full size and close', async ({ player, app }) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 'photo.png');
    expect((await app.gmApi('/api/gm/upload?kind=photo', { body: fd })).ok).toBeTruthy();
    await startGame(player, app.base);
    await player.getByRole('img', { name: /Field image 1/ }).click();
    const zoom = player.getByRole('dialog', { name: 'Field image' });
    await expect(zoom).toBeVisible();
    await zoom.getByRole('button').click();
    await expect(zoom).toHaveCount(0);
    const cfg = await app.config();
    for (const id of cfg.geo.photos) await app.gmApi(`/api/gm/upload/${id}`, { method: 'DELETE' });
  });
});
