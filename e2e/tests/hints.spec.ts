import { expect, test } from './fixtures';

test.describe('hints', () => {
  test.beforeEach(async ({ player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    await expect(player.getByRole('tab', { name: 'evidence' })).toBeVisible();
  });

  test('a written hint takes over the phone and lands in the transmissions list', async ({ player, gm }) => {
    await gm.getByLabel('Transmission text').fill('Count back thirty minutes from the time of death.');
    await gm.getByRole('button', { name: /push to his screen/i }).click();
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('button', { name: /acknowledge/i })).toBeFocused();
    await overlay.getByRole('button', { name: /acknowledge/i }).click();
    await expect(overlay).toHaveCount(0);
    await player.getByRole('button', { name: /transmissions \(1\)/i }).click();
    const list = player.getByRole('dialog', { name: /transmissions received/i });
    await expect(list.getByText('Count back thirty minutes from the time of death.')).toBeVisible();
    await list.getByRole('button', { name: /^close$/i }).click();
  });

  test('Escape acknowledges a hint on a keyboard', async ({ player, app }, testInfo) => {
    test.skip(!!testInfo.project.use.isMobile, 'phones have no Escape key');
    await app.gmApi('/api/gm/hint', { json: { text: 'Press Escape to dismiss.' } });
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toBeVisible();
    await player.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
  });

  test('an acknowledged hint does not come back after a reload', async ({ player, app }) => {
    await app.gmApi('/api/gm/hint', { json: { text: 'Check the property log.' } });
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toBeVisible();
    await overlay.getByRole('button', { name: /acknowledge/i }).click();
    await player.reload();
    await expect(player.getByRole('tab', { name: 'evidence' })).toBeVisible();
    await player.waitForTimeout(800);
    await expect(overlay).toHaveCount(0);
  });

  test('quick hints send in one tap and AI drafts fill the editor', async ({ player, gm }) => {
    await gm.locator('.quick-row').first().getByRole('button', { name: /^send$/i }).click();
    await expect(player.getByRole('dialog', { name: /incoming transmission/i })).toBeVisible();
    await gm.getByLabel('Hint strength').selectOption('clear');
    await gm.getByRole('button', { name: /^draft$/i }).click();
    await expect(gm.getByText(/Copilot:/)).toBeVisible({ timeout: 15_000 });
    await expect(gm.getByLabel('Transmission text')).not.toHaveValue('');
  });
});
