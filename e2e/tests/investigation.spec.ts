import { RIGHT_ANSWERS, expect, fillDeduction, noHorizontalScroll, test, clearWord, typeWord } from './fixtures';

test.describe('investigation', () => {
  test.beforeEach(async ({ player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    await expect(player.getByRole('tab', { name: 'evidence' })).toBeVisible();
  });

  test('every evidence file opens and the access log fits the phone', async ({ player }) => {
    const header = (name: string) => player.locator('.file header', { hasText: name });
    const file = (name: string) => player.locator('.file', { has: player.locator('header', { hasText: name }) });
    await expect(player.getByText('To whoever the courier reaches first,')).toBeVisible();
    await header('00_Directors').click();
    await header('01_Vault').click();
    await expect(player.getByText('Rows from 03:30 to 04:00 are marked.')).toBeVisible();
    await expect(player.getByText(/one card envelope/)).toBeVisible();
    await noHorizontalScroll(player);
    await header('01_Vault').click();
    await header('02_Audio').click();
    await expect(player.getByText(/Paper rustle/)).toBeVisible();
    await header('02_Audio').click();
    await header('03_Toxicology').click();
    await expect(player.getByText('PRELIMINARY TOXICOLOGY', { exact: false })).toBeVisible();
    await header('03_Toxicology').click();
    await header('04_Incident').click();
    await expect(player.getByText(/TIME OF DEATH: 04:15/).first()).toBeVisible();
  });

  test('ARCHIVE answers questions from the case files', async ({ player }) => {
    await player.getByRole('tab', { name: 'archive' }).click();
    const integrity = player.getByText(/INTEGRITY \d+%/i);
    const before = Number((await integrity.textContent())!.match(/(\d+)%/)![1]);
    await player.getByLabel('Query').fill('who was in the office at 03:45');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Vector' })).toBeVisible();
    await player.getByLabel('Query').fill('read the toxicology report');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Nightshade' })).toBeVisible();
    await expect.poll(async () => Number((await integrity.textContent())!.match(/(\d+)%/)![1])).toBeGreaterThan(before);
  });

  test('ARCHIVE transcript survives switching tabs and reloading', async ({ player }) => {
    await player.getByRole('tab', { name: 'archive' }).click();
    await player.getByLabel('Query').fill('read the toxicology report');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Nightshade' })).toBeVisible();
    await player.getByRole('tab', { name: 'evidence' }).click();
    await player.getByRole('tab', { name: 'archive' }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Nightshade' })).toBeVisible();
    await player.reload();
    await player.getByRole('tab', { name: 'archive' }).click();
    await expect(player.getByText('read the toxicology report')).toBeVisible();
  });

  test('deduction draft survives tab switches and reloads', async ({ player }) => {
    await player.getByRole('tab', { name: 'deduction' }).click();
    await fillDeduction(player, { SUSPECT: 'Agent Vector', METHOD: 'poisoned tea' });
    await player.getByRole('tab', { name: 'evidence' }).click();
    await player.getByRole('tab', { name: 'deduction' }).click();
    await expect(player.getByLabel('SUSPECT', { exact: true })).toHaveValue('Agent Vector');
    await player.reload();
    await player.getByRole('tab', { name: 'deduction' }).click();
    await expect(player.getByLabel('METHOD', { exact: true })).toHaveValue('poisoned tea');
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

  test('count feedback mode tells the player how many fields verified', async ({ player, app }) => {
    await app.patch((c) => (c.deduction.feedback = 'count'));
    await player.reload();
    await player.getByRole('tab', { name: 'deduction' }).click();
    await fillDeduction(player, { ...RIGHT_ANSWERS, SUSPECT: 'Agent Cipher' });
    await player.getByRole('button', { name: /submit deduction/i }).click();
    await expect(player.getByText('FIELDS VERIFIED: 5 / 6')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('evidence vault with passcodes', () => {
  test('sealed files open with the right passcodes only', async ({ player, app }) => {
    await app.patch((c) => (c.evidence.gateMode = 'passcodes'));
    await app.setStage('investigation');
    await player.goto(app.base);
    const header = (name: string) => player.locator('.file header', { hasText: name });
    const file = (name: string) => player.locator('.file', { has: player.locator('header', { hasText: name }) });
    await expect(header('02_Audio')).toContainText(/sealed/i);
    await expect(header('03_Toxicology')).toContainText(/sealed/i);
    await expect(header('03b_Operative')).toBeVisible();

    await header('02_Audio').click();
    const audioFile = file('02_Audio');
    await typeWord(player, 'WRONG', audioFile);
    await audioFile.getByRole('button', { name: /^unlock$/i }).click();
    await expect(player.getByRole('alert')).toBeVisible();
    await clearWord(player, audioFile);
    await typeWord(player, 'canis30', audioFile);
    await audioFile.getByRole('button', { name: /^unlock$/i }).click();
    await expect(player.getByText(/Paper rustle/)).toBeVisible();

    await header('03_Toxicology').click();
    const toxFile = file('03_Toxicology');
    await typeWord(player, '1996', toxFile);
    await toxFile.getByRole('button', { name: /^unlock$/i }).click();
    await expect(player.getByText('PRELIMINARY TOXICOLOGY', { exact: false })).toBeVisible();
  });
});
