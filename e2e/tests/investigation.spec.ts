import { RIGHT_ANSWERS, WRONG_SUSPECT, acceptDialogs, clearWord, expect, fillDeduction, noHorizontalScroll, releaseLayer2, test, typeWord } from './fixtures';

test.describe('investigation', () => {
  test.beforeEach(async ({ player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
  });

  test('Layer 01 lists the five agents and Layer 02 stays sealed', async ({ player }) => {
    const section = (name: string) => player.locator('.file header', { hasText: name });
    await expect(player.getByText(/ask every agent where they were/i)).toBeVisible();
    await expect(player.getByText('11:00 PM to 4:00 AM')).toBeVisible();
    for (const name of ['Mara Voss', 'Elias Mercer', 'Nina Calder', 'Theo Blackwood', 'Celeste Rowan']) await expect(player.locator('.agent header', { hasText: name })).toBeVisible();
    // The first agent opens by default; the others open on tap.
    await expect(player.getByText(/antique military memorabilia/)).toBeVisible();
    await player.locator('.agent header', { hasText: 'Nina Calder' }).click();
    await expect(player.getByText(/Rarely forgets a conversation/)).toBeVisible();
    await expect(player.getByText(/2:00/)).toHaveCount(0);
    await noHorizontalScroll(player);
    await expect(section('LAYER 02')).toContainText(/sealed/i);
    await section('LAYER 02').click();
    await expect(player.getByLabel('Passcode')).toBeVisible();
    await expect(player.getByText('Silver letter opener')).toHaveCount(0);
    await section('LEDGER DECRYPTION RECORD').click();
    await expect(player.getByText(/Return to headquarters/).first()).toBeVisible();
  });

  test('a GM release opens Layer 02 on the phone with a transmission', async ({ player, gm }) => {
    acceptDialogs(gm);
    // He is on another tab when the release lands, so the Ledger tab lights up until he looks.
    await player.getByRole('tab', { name: 'archive' }).click();
    await expect(gm.getByTestId('ledger-panel')).toContainText('sealed');
    await gm.getByRole('button', { name: /^release layer 02$/i }).click();
    await expect(gm.getByTestId('ledger-panel')).toContainText('RELEASED');
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText(/CLASSIFIED EVIDENCE/);
    await overlay.getByRole('button', { name: /acknowledge/i }).click();
    const dot = player.getByRole('tab', { name: 'ledger' }).locator('.fresh-dot');
    await expect(dot).toBeVisible();
    await player.getByRole('tab', { name: 'ledger' }).click();
    await expect(dot).toHaveCount(0);
    await expect(player.getByText('Confirmed time of death:')).toBeVisible();
    await expect(player.getByText('2:14 AM').first()).toBeVisible();
    await player.locator('.agent.l2 header', { hasText: 'Nina Calder' }).click();
    await expect(player.getByText('Silver letter opener')).toBeVisible();
    await expect(player.getByText("Badge: Director's Office, in.", { exact: true })).toBeVisible();
    await expect(player.getByText(/Duty officer Hale/).first()).toBeVisible();
    await noHorizontalScroll(player);
    // Re-sealing in rehearsal takes it away again.
    await gm.getByRole('button', { name: /re-seal layer 02/i }).click();
    const sealed = player.locator('.file header', { hasText: 'LAYER 02' });
    await expect(sealed).toContainText(/sealed/i);
    await sealed.click();
    await expect(player.getByLabel('Passcode')).toBeVisible();
  });

  test('the passcode opens Layer 02 and a wrong one is rejected in place', async ({ player }) => {
    await player.locator('.file header', { hasText: 'LAYER 02' }).click();
    const sealed = player.locator('.file', { has: player.locator('header', { hasText: 'LAYER 02' }) });
    await typeWord(player, 'WRONG', sealed);
    await sealed.getByRole('button', { name: /^unlock$/i }).click();
    await expect(player.getByRole('alert')).toContainText(/REJECTED/);
    await clearWord(player, sealed);
    await typeWord(player, 'magenta30', sealed);
    await sealed.getByRole('button', { name: /^unlock$/i }).click();
    await expect(player.getByText('Confirmed time of death:')).toBeVisible();
  });

  test('ARCHIVE answers from Layer 01 and refuses Layer 02 until it is released', async ({ player, app }) => {
    await player.getByRole('tab', { name: 'archive' }).click();
    const integrity = player.getByText(/INTEGRITY \d+%/i);
    const before = Number((await integrity.textContent())!.match(/(\d+)%/)![1]);
    await player.getByLabel('Query').fill('tell me about Nina Calder');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Intelligence Analyst' })).toBeVisible();
    await player.getByLabel('Query').fill('where was everyone at 2:14');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant').last()).toContainText('personnel files, not movements');
    await player.getByLabel('Query').fill('read the classified evidence');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant').last()).toContainText('LAYER SEALED');
    await expect.poll(async () => Number((await integrity.textContent())!.match(/(\d+)%/)![1])).toBeGreaterThan(before);
    await releaseLayer2(app);
    await player.getByRole('dialog', { name: /incoming transmission/i }).getByRole('button', { name: /acknowledge/i }).click();
    await player.getByLabel('Query').fill('read the classified evidence');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Confirmed time of death 2:14 AM' })).toBeVisible();
  });

  test('ARCHIVE transcript survives switching tabs and reloading', async ({ player }) => {
    await player.getByRole('tab', { name: 'archive' }).click();
    await player.getByLabel('Query').fill('tell me about Theo Blackwood');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Field Operative' })).toBeVisible();
    await player.getByRole('tab', { name: 'ledger' }).click();
    await player.getByRole('tab', { name: 'archive' }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Field Operative' })).toBeVisible();
    await player.reload();
    await player.getByRole('tab', { name: 'archive' }).click();
    await expect(player.getByText('tell me about Theo Blackwood')).toBeVisible();
  });

  test('deduction draft survives tab switches and reloads', async ({ player }) => {
    await player.getByRole('tab', { name: 'deduction' }).click();
    await fillDeduction(player, { SUSPECT: 'Nina Calder', METHOD: 'letter opener' });
    await player.getByRole('tab', { name: 'ledger' }).click();
    await player.getByRole('tab', { name: 'deduction' }).click();
    await expect(player.getByLabel('SUSPECT', { exact: true })).toHaveValue('Nina Calder');
    await player.reload();
    await player.getByRole('tab', { name: 'deduction' }).click();
    await expect(player.getByLabel('METHOD', { exact: true })).toHaveValue('letter opener');
  });

  test('submit stays disabled until every blank is filled', async ({ player }) => {
    await player.getByRole('tab', { name: 'deduction' }).click();
    const submit = player.getByRole('button', { name: /submit deduction/i });
    await expect(submit).toBeDisabled();
    await fillDeduction(player, { ...RIGHT_ANSWERS, MOTIVE: '' });
    await expect(submit).toBeDisabled();
    await fillDeduction(player, { MOTIVE: 'money' });
    await expect(submit).toBeEnabled();
  });

  test('a wrong deduction is weighed before it is rejected', async ({ player }) => {
    await player.getByRole('tab', { name: 'deduction' }).click();
    await fillDeduction(player, { ...RIGHT_ANSWERS, 'PHYSICAL PROP': 'the teapot' });
    const started = Date.now();
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await expect(player.getByRole('alert').filter({ hasText: 'DEDUCTION REJECTED' })).toBeVisible({ timeout: 15_000 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(2400);
    await expect(player.getByText('Submissions: 1')).toBeVisible();
  });

  test('poison, the old red herring, fails the method field', async ({ player, app }) => {
    await app.patch((c) => (c.deduction.feedback = 'count'));
    await player.reload();
    await player.getByRole('tab', { name: 'deduction' }).click();
    await fillDeduction(player, { ...RIGHT_ANSWERS, METHOD: 'poisoned tea' });
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await expect(player.getByText('FIELDS VERIFIED: 5 / 6')).toBeVisible({ timeout: 15_000 });
  });

  test('count feedback mode tells the player how many fields verified', async ({ player, app }) => {
    await app.patch((c) => (c.deduction.feedback = 'count'));
    await player.reload();
    await player.getByRole('tab', { name: 'deduction' }).click();
    await fillDeduction(player, { ...RIGHT_ANSWERS, SUSPECT: WRONG_SUSPECT });
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await expect(player.getByText('FIELDS VERIFIED: 5 / 6')).toBeVisible({ timeout: 15_000 });
  });
});
