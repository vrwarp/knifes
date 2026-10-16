import { expect, test } from './fixtures';

test.describe('GM API', () => {
  test('refuses requests without the GM cookie', async ({ app, request }) => {
    expect((await request.get(`${app.base}/api/gm/overview`)).status()).toBe(401);
    expect((await request.post(`${app.base}/api/gm/hint`, { data: { text: 'x' } })).status()).toBe(401);
  });
});

test.describe('connection loss', () => {
  test('the phone polls and shows a banner when the live link is down', async ({ player, app }) => {
    await player.routeWebSocket(/\/ws/, (ws) => ws.close({ code: 1011 }));
    await player.goto(app.base);
    await expect(player.getByText(/Link lost/)).toBeVisible({ timeout: 12_000 });
    // Polling still delivers GM changes.
    await app.setStage('gate');
    await expect(player.locator('h1', { hasText: 'Secure line' })).toBeVisible({ timeout: 15_000 });
  });

  test('the GM console warns when its live link is down', async ({ gmContext, app }) => {
    const page = await gmContext.newPage();
    await page.routeWebSocket(/\/ws/, (ws) => ws.close({ code: 1011 }));
    await page.goto(`${app.base}/gm`);
    await expect(page.getByText(/Link down/)).toBeVisible({ timeout: 12_000 });
  });
});
