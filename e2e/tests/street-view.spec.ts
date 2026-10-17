import { expect, startGame, test } from './fixtures';

// A dummy key: the panel must mount and stay out of the way of the page; Google rejects the key, so
// the feed reports itself offline instead of hanging. No Google traffic is needed for the lock state.
test.use({ serverEnv: { GOOGLE_MAPS_API_KEY: 'e2e-dummy-key' } });

test.describe('street view feed', () => {
  test('shows a locked feed when a key and a target are set, none once solved', async ({ player, app }) => {
    const c = await app.config();
    await app.patch((cfg) => {
      cfg.geo.target = { ...c.geo.mapCenter };
      cfg.geo.radiusMeters = 3000;
    });
    await startGame(player, app.base);
    const feed = player.getByLabel('Street View feed');
    await expect(feed).toBeVisible();
    const unlock = player.getByRole('button', { name: /tap to look around/i });
    await expect(unlock).toBeVisible();
    await expect(player.getByText('[IMAGE BURST NOT YET RECOVERED]')).toHaveCount(0);
    // The map keeps its own lock, so both widgets scroll past until tapped.
    await expect(player.getByRole('button', { name: /tap to unlock map/i })).toBeVisible();
    await player.getByRole('button', { name: /tap to unlock map/i }).click();
    const map = player.locator('.map');
    const box = (await map.boundingBox())!;
    await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await player.getByRole('button', { name: /triangulate/i }).click();
    await expect(player.getByText('LOCATION CONFIRMED')).toBeVisible();
    await expect(feed).toHaveCount(0);
    // The panorama coordinates never reach the phone once the puzzle is over.
    const view = await (await player.request.get(`${app.base}/api/player/state`)).json();
    expect(view.geo.streetView).toBeNull();
  });

  test('no feed without a target', async ({ player, app }) => {
    await app.patch((cfg) => (cfg.geo.target = null));
    await startGame(player, app.base);
    await expect(player.getByText('[IMAGE BURST NOT YET RECOVERED]')).toBeVisible();
    await expect(player.getByLabel('Street View feed')).toHaveCount(0);
  });
});
