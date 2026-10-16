import { GM_PASSWORD, acceptDialogs, configSection, expect, finishBeats, newGmPage, noHorizontalScroll, startGame, test } from './fixtures';

test.describe('GM console', () => {
  test('rejects a wrong password and admits the right one', async ({ page, app }) => {
    await page.goto(`${app.base}/gm`);
    await page.getByLabel('Password').fill('nope');
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.getByText(/wrong password/i)).toBeVisible();
    await page.getByLabel('Password').fill(GM_PASSWORD);
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.getByText('GM console').first()).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('shows the phone link and follows the player live', async ({ player, gm, app }) => {
    await expect(gm.getByText(/no phone linked/i)).toBeVisible();
    await startGame(player, app.base);
    await expect(gm.getByText('phone linked', { exact: true })).toBeVisible();
    await expect(gm.locator('.chip.now', { hasText: /field transmission/i })).toBeVisible();
    await expect(gm.locator('.log .ev', { hasText: /game start/i }).first()).toBeVisible();
  });

  test('flags a stuck player amber at five minutes and red at ten', async ({ player, browser, app }, testInfo) => {
    await startGame(player, app.base);
    await app.setStage('hack');
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
    const { context, page } = await newGmPage(browser, app, testInfo);
    await page.clock.install();
    await page.goto(`${app.base}/gm`);
    const strip = page.locator('div.now');
    await expect(strip).toBeVisible();
    await expect(strip).not.toHaveClass(/stuck/);
    await page.clock.fastForward('05:30');
    await expect(strip).toHaveClass(/stuck/);
    await expect(strip).toContainText(/idle 5m/);
    await page.clock.fastForward('05:00');
    await expect(strip).toHaveClass(/stuck2/);
    await context.close();
  });

  test('skips ahead and jumps back, asking first', async ({ player, gm, app }) => {
    const dialogs = acceptDialogs(gm);
    await startGame(player, app.base);
    await expect(gm.locator('.chip.now', { hasText: /field transmission/i })).toBeVisible();
    await gm.getByLabel('Stage to jump to').selectOption('investigation');
    await gm.getByRole('button', { name: /unlock \/ skip to/i }).click();
    await expect(player.getByRole('tab', { name: 'evidence' })).toBeVisible();
    expect(dialogs.at(-1)).toMatch(/^Unlock Investigation now\?/);
    await gm.getByLabel('Stage to jump to').selectOption('gate');
    await gm.getByRole('button', { name: /jump back/i }).click();
    await expect(player.locator('h1', { hasText: 'Secure line' })).toBeVisible();
    expect(dialogs.at(-1)).toMatch(/^Jump BACK/);
  });

  test('the chosen jump target holds when the player advances', async ({ player, gm, app }) => {
    acceptDialogs(gm);
    await player.goto(app.base);
    await expect(player.getByRole('button', { name: /initiate recovery protocol/i })).toBeVisible();
    await gm.getByLabel('Stage to jump to').selectOption('investigation');
    await startGame(player, app.base);
    await expect(gm.locator('.chip.now', { hasText: /field transmission/i })).toBeVisible();
    await expect(gm.getByLabel('Stage to jump to')).toHaveValue('investigation');
    await gm.getByRole('button', { name: /unlock \/ skip to/i }).click();
    await expect(player.getByRole('tab', { name: 'evidence' })).toBeVisible();
  });

  test('declining the confirmation changes nothing', async ({ player, gm, app }) => {
    gm.on('dialog', (d) => d.dismiss());
    await startGame(player, app.base);
    await gm.getByLabel('Stage to jump to').selectOption('investigation');
    await gm.getByRole('button', { name: /unlock \/ skip to/i }).click();
    await gm.waitForTimeout(500);
    await expect(player.locator('h1', { hasText: 'Field transmission' })).toBeVisible();
  });

  test('resets one stage and sends the phone back to it', async ({ player, gm, app }) => {
    acceptDialogs(gm);
    await app.setStage('hack');
    await player.goto(app.base);
    await player.getByLabel('Key attempt').fill('PLANT');
    await player.getByRole('button', { name: /attempt key/i }).click();
    await expect(player.getByRole('img', { name: /Attempt 1:/ })).toBeVisible();
    await gm.getByLabel('Stage to reset').selectOption('hack');
    await gm.getByRole('button', { name: /^reset stage$/i }).click();
    await expect(player.getByRole('img', { name: /Attempt 1:/ })).toHaveCount(0);
  });

  test('seals and unseals ARCHIVE, and clears its session', async ({ player, gm, app }) => {
    acceptDialogs(gm);
    await app.setStage('investigation');
    await player.goto(app.base);
    await player.getByRole('tab', { name: 'archive' }).click();
    await player.getByLabel('Query').fill('read the toxicology report');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Nightshade' })).toBeVisible();
    await expect(gm.getByText('read the toxicology report').first()).toBeVisible();

    await gm.getByRole('button', { name: /^seal archive$/i }).click();
    await expect(player.getByText('ARCHIVE SEALED BY COMMAND AUTHORITY')).toBeVisible();
    await gm.getByRole('button', { name: /^unseal archive$/i }).click();
    await expect(player.getByText('ARCHIVE SEALED BY COMMAND AUTHORITY')).toHaveCount(0);

    await gm.getByRole('button', { name: /new archive session/i }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Nightshade' })).toHaveCount(0);
  });

  test('filters the live log by lane', async ({ player, gm, app }) => {
    await startGame(player, app.base);
    await app.gmApi('/api/gm/hint', { json: { text: 'A test hint.' } });
    const filter = (name: string) => gm.locator('.log-filters button', { hasText: new RegExp(`^${name}$`, 'i') });
    await expect(gm.locator('.log .ev', { hasText: /hint pushed/i }).first()).toBeVisible();
    await filter('player').click();
    await expect(gm.locator('.log .ev', { hasText: /hint pushed/i })).toHaveCount(0);
    await expect(gm.locator('.log .ev', { hasText: /game start/i }).first()).toBeVisible();
    await filter('all').click();
    await expect(gm.locator('.log .ev', { hasText: /hint pushed/i }).first()).toBeVisible();
  });

  test('generates, previews, publishes and unpublishes the case report', async ({ player, gm, app }) => {
    acceptDialogs(gm);
    await app.setStage('solved');
    await player.goto(app.base);
    await finishBeats(player);
    await gm.getByRole('button', { name: /generate with ai/i }).click();
    await expect(gm.getByText(/Generated \d/)).toBeVisible({ timeout: 15_000 });
    await gm.getByRole('button', { name: /^preview$/i }).click();
    await expect(gm.getByText('Filed by ARCHIVE', { exact: false }).first()).toBeVisible();
    await gm.getByRole('button', { name: /publish to player/i }).click();
    await expect(player.getByText('CASE FILE 30-0415').first()).toBeVisible();
    await gm.getByRole('button', { name: /unpublish from player/i }).click();
    await expect(player.getByText('CASE FILE 30-0415')).toHaveCount(0);
  });

  test('whole-game reset needs RESET typed', async ({ player, gm, app }) => {
    await startGame(player, app.base);
    await gm.locator('summary', { hasText: 'Danger zone' }).click();
    gm.once('dialog', (d) => d.accept('reset please'));
    await gm.getByRole('button', { name: /reset whole game/i }).click();
    await gm.waitForTimeout(500);
    await expect(player.locator('h1', { hasText: 'Field transmission' })).toBeVisible();
    gm.once('dialog', (d) => d.accept('RESET'));
    await gm.getByRole('button', { name: /reset whole game/i }).click();
    await expect(player.getByRole('button', { name: /initiate recovery protocol/i })).toBeVisible();
  });
});

test.describe('GM configuration', () => {
  test('edits are typed key by key, saved, and pushed to the phone', async ({ player, gm, app }) => {
    await app.patch((c) => (c.geo.mode = 'off'));
    await startGame(player, app.base);
    await expect(gm.locator('summary', { hasText: 'Game configuration (collapsed' })).toBeVisible();
    const gate = await configSection(gm, 'Code gate');
    const prompt = gate.locator('textarea').first();
    await prompt.fill('');
    await prompt.pressSequentially('Call Phil.');
    await expect(prompt).toHaveValue('Call Phil.');
    await expect(prompt).toBeFocused();
    await gm.getByRole('button', { name: /save config/i }).click();
    await expect(gm.getByText('Saved and pushed')).toBeVisible();
    await expect(player.locator('pre.typed:not(.ghost)', { hasText: 'Call Phil.' })).toBeVisible();
    expect((await app.config()).gate.prompt).toBe('Call Phil.');
  });

  test('coordinate and list fields accept typing', async ({ gm }) => {
    await configSection(gm, 'Location puzzle');
    const coords = gm.getByPlaceholder('34.0522, -118.2437');
    await coords.fill('');
    await coords.pressSequentially('34.05, -118.24');
    await expect(coords).toHaveValue('34.05, -118.24');
    const grid = await configSection(gm, 'Deduction grid');
    await grid.locator('summary', { hasText: 'time:' }).click();
    const accept = grid.getByLabel('Accepted phrasings (comma separated)', { exact: true }).first();
    await accept.fill('');
    await accept.pressSequentially('03:45, 3:45,');
    await expect(accept).toHaveValue('03:45, 3:45,');
    await gm.getByRole('button', { name: /discard/i }).click();
  });

  test('invalid values are refused with a reason', async ({ gm }) => {
    const puzzle = await configSection(gm, 'Word puzzle');
    const secret = puzzle.getByLabel(/secret word/i);
    await secret.fill('A1');
    await gm.getByRole('button', { name: /save config/i }).click();
    await expect(gm.getByText(/Invalid config at hack\.secret/)).toBeVisible();
    await gm.getByRole('button', { name: /discard/i }).click();
  });

  test('warns when another GM saved while you were editing', async ({ gm, app }) => {
    const gate = await configSection(gm, 'Code gate');
    await gate.locator('textarea').first().fill('My unsaved edit');
    await app.patch((c) => (c.archive.welcome = c.archive.welcome + ' '));
    await expect(gm.getByText(/Another GM saved a newer configuration/)).toBeVisible();
    await expect(gm.getByRole('button', { name: /save config/i })).toBeDisabled();
    await gm.getByRole('button', { name: /discard/i }).click();
    await expect(gm.getByText(/Another GM saved a newer configuration/)).toHaveCount(0);
  });
});
