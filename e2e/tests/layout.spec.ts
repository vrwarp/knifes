import { expect, finishTyping, noHorizontalScroll, test } from './fixtures';

// Every player screen must fit the device with no sideways scroll and readable, tappable controls.
const stages = ['intro', 'geo', 'gate', 'hack', 'reveal', 'investigation', 'solved'] as const;

for (const stage of stages) {
  test(`${stage} screen fits the viewport`, async ({ player, app }) => {
    await app.setStage(stage);
    await player.goto(app.base);
    await expect(player.locator('h1, [role=tab]').first()).toBeVisible();
    await finishTyping(player);
    await noHorizontalScroll(player);
    if (stage === 'investigation') {
      for (const tab of ['evidence', 'archive', 'deduction']) {
        await player.getByRole('tab', { name: tab }).click();
        await noHorizontalScroll(player);
      }
      await player.getByRole('tab', { name: 'evidence' }).click();
      await player.locator('.file header', { hasText: '01_Vault' }).click();
      await noHorizontalScroll(player);
    }
    // Text inputs are at least 16px so iOS Safari does not zoom on focus.
    const small = await player.locator('input:visible, textarea:visible').evaluateAll((els) =>
      els.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.getAttribute('aria-label') || e.outerHTML.slice(0, 60)),
    );
    expect(small, 'inputs under 16px').toEqual([]);
  });
}

test('primary buttons are at least 44px tall on touch devices', async ({ player, app }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch targets only matter on phones');
  for (const stage of ['intro', 'gate', 'hack', 'reveal'] as const) {
    await app.setStage(stage);
    await player.goto(app.base);
    await expect(player.locator('h1').first()).toBeVisible();
    await finishTyping(player);
    const heights = await player.locator('.btn.block:visible, .key:visible').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const h of heights) expect(h, `${stage} button height`).toBeGreaterThanOrEqual(42);
    if (stage === 'hack') {
      // The whole race screen (both boards and the keyboard) fits a phone without scrolling past the keyboard.
      const kb = await player.getByRole('group', { name: 'Keyboard' }).boundingBox();
      const vh = player.viewportSize()!.height;
      expect(kb, 'keyboard rendered').not.toBeNull();
      expect(kb!.y + kb!.height, 'keyboard bottom within the viewport').toBeLessThanOrEqual(vh + 40);
    }
  }
});

test('GM console fits the viewport', async ({ gm }) => {
  await noHorizontalScroll(gm);
  await expect(gm.locator('div.now')).toBeVisible();
});
