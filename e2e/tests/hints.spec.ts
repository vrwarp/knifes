import { expect, test } from './fixtures';

test.describe('hints', () => {
  test.beforeEach(async ({ player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
  });

  test('a written hint takes over the phone and lands in the transmissions list', async ({ player, gm }) => {
    await gm.getByLabel('Transmission text').fill('Hold what they told you against what the cameras recorded.');
    await gm.getByRole('button', { name: /push to his screen/i }).click();
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('button', { name: /acknowledge/i })).toBeFocused();
    await overlay.getByRole('button', { name: /acknowledge/i }).click();
    await expect(overlay).toHaveCount(0);
    await player.getByRole('button', { name: /transmissions \(1\)/i }).click();
    const list = player.getByRole('dialog', { name: /transmissions received/i });
    await expect(list.getByText('Hold what they told you against what the cameras recorded.')).toBeVisible();
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
    await app.gmApi('/api/gm/hint', { json: { text: 'Ask who badged into the office.' } });
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toBeVisible();
    await overlay.getByRole('button', { name: /acknowledge/i }).click();
    await player.reload();
    await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
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

test.describe('a transmission over a keyboard', () => {
  test('keys pressed under a transmission are its own, not the code field behind it', async ({ player, app }, testInfo) => {
    test.skip(!!testInfo.project.use.isMobile, 'phones have no hardware keyboard');
    await app.setStage('gate');
    await player.goto(app.base);
    await expect(player.locator('h1', { hasText: 'Secure line' })).toBeVisible();
    const field = player.locator('.prompt-line');
    await player.keyboard.type('S30GHOST');
    await expect(field).toContainText('S30GHOST');
    await app.gmApi('/api/gm/hint', { json: { text: 'Read the code back before you send it.' } });
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay.getByRole('button', { name: /acknowledge/i })).toBeFocused();
    await player.keyboard.press('Backspace');
    await player.keyboard.type('XY');
    await player.keyboard.press('Enter');
    await expect(overlay).toHaveCount(0);
    await expect(field).toContainText('S30GHOST');
    await expect(field).not.toContainText('XY');
    expect((await (await app.gmApi('/api/gm/overview')).json()).state.stage, 'Enter on Acknowledge did not submit the code').toBe('gate');
    await player.keyboard.press('Enter');
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
  });

  test('two transmissions back to back come up one at a time, oldest first, and both land in the list', async ({ player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
    await app.gmApi('/api/gm/hint', { json: { text: 'FIRST: check the badge log.' } });
    await app.gmApi('/api/gm/hint', { json: { text: 'SECOND: check the cameras.' } });
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toContainText('FIRST: check the badge log.');
    await expect(player.getByRole('dialog', { name: /incoming transmission/i })).toHaveCount(1);
    await overlay.getByRole('button', { name: /acknowledge/i }).click();
    await expect(overlay).toContainText('SECOND: check the cameras.');
    await overlay.getByRole('button', { name: /acknowledge/i }).click();
    await expect(overlay).toHaveCount(0);
    await player.getByRole('button', { name: /transmissions \(2\)/i }).click();
    const list = player.getByRole('dialog', { name: /transmissions received/i });
    await expect(list).toContainText('FIRST: check the badge log.');
    await expect(list).toContainText('SECOND: check the cameras.');
  });

  test('transmissions sent while the phone was away come up in order when it is back', async ({ player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
    await player.goto('about:blank');
    for (const n of ['ONE', 'TWO', 'THREE']) await app.gmApi('/api/gm/hint', { json: { text: `Transmission ${n}.` } });
    await player.goto(app.base);
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    for (const n of ['ONE', 'TWO', 'THREE']) {
      await expect(overlay).toContainText(`Transmission ${n}.`);
      await overlay.getByRole('button', { name: /acknowledge/i }).click();
    }
    await expect(overlay).toHaveCount(0);
    await player.reload();
    await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
    await player.waitForTimeout(800);
    await expect(overlay, 'acknowledged transmissions stay acknowledged').toHaveCount(0);
  });
});
