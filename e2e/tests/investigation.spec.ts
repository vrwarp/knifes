import { acceptDialogs, expect, noHorizontalScroll, releaseLayer2, test } from './fixtures';

test.describe('investigation', () => {
  test.beforeEach(async ({ player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
  });

  test('the personnel files list the five agents and the surveillance records do not exist yet', async ({ player }) => {
    const section = (name: string) => player.locator('.file header', { hasText: name });
    await expect(player.getByText(/ask every agent where they were/i)).toBeVisible();
    await expect(player.getByText('11:00 PM to 4:00 AM')).toBeVisible();
    for (const name of ['Mara Voss', 'Elias Mercer', 'Nina Calder', 'Theo Blackwood', 'Celeste Rowan']) await expect(player.locator('.agent header', { hasText: name })).toBeVisible();
    // The first agent opens by default; the others open on tap.
    await expect(player.locator('.agent .notes', { hasText: /antique military memorabilia/ })).toBeVisible();
    await player.locator('.agent header', { hasText: 'Nina Calder' }).click();
    await expect(player.locator('.agent .notes', { hasText: /rarely forgets a conversation/i })).toBeVisible();
    await expect(player.getByText(/2:00/)).toHaveCount(0);
    await noHorizontalScroll(player);
    await expect(player.getByText(/SURVEILLANCE|LAYER 02|CLASSIFIED EVIDENCE/)).toHaveCount(0);
    await expect(player.locator('.agent header .tiny')).toHaveCount(0);
    await expect(player.getByText('Silver letter opener')).toHaveCount(0);
    await section('LEDGER DECRYPTION RECORD').click();
    await expect(player.getByText(/Return to headquarters/).first()).toBeVisible();
  });

  test('a GM release puts the surveillance records on the phone with a transmission', async ({ player, gm }) => {
    acceptDialogs(gm);
    // He is on another tab when the release lands, so the Ledger tab lights up until he looks.
    await player.getByRole('tab', { name: 'archive' }).click();
    await expect(gm.getByTestId('ledger-panel')).toContainText('hidden');
    await expect(gm.getByTestId('ledger-panel')).toContainText('Call 2 · Matt');
    await gm.getByRole('button', { name: /^release records$/i }).click();
    await expect(gm.getByTestId('ledger-panel')).toContainText('RELEASED');
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText(/SURVEILLANCE RECORDS/);
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
    await noHorizontalScroll(player);
    // Hiding it again in rehearsal takes the section away entirely.
    await gm.getByRole('button', { name: /^hide records$/i }).click();
    await expect(player.getByText(/SURVEILLANCE RECORDS/)).toHaveCount(0);
  });

  test('ARCHIVE answers from the personnel files and has no record of the night until the release', async ({ player, app }) => {
    await player.getByRole('tab', { name: 'archive' }).click();
    const integrity = player.getByText(/INTEGRITY \d+%/i);
    const before = Number((await integrity.textContent())!.match(/(\d+)%/)![1]);
    await player.getByLabel('Query').fill('tell me about Nina Calder');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant', { hasText: 'Intelligence Analyst' })).toBeVisible();
    const answers = player.locator('.msg.assistant');
    // The welcome line is an assistant message too; each answer adds one, and waiting on the count
    // keeps a slow answer from landing after the release below.
    await expect(answers).toHaveCount(2);
    await player.getByLabel('Query').fill('where was everyone at 2:14');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(answers).toHaveCount(3);
    await expect(answers.last()).toContainText('[NO RECORD]');
    await player.getByLabel('Query').fill('read the surveillance records');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(answers).toHaveCount(4);
    await expect(answers.last()).toContainText('[NO RECORD]');
    await expect(player.locator('.msg.assistant').last()).not.toContainText(/sealed|layer|surveillance/i);
    await expect.poll(async () => Number((await integrity.textContent())!.match(/(\d+)%/)![1])).toBeGreaterThan(before);
    await releaseLayer2(app);
    await player.getByRole('dialog', { name: /incoming transmission/i }).getByRole('button', { name: /acknowledge/i }).click();
    await player.getByLabel('Query').fill('read the surveillance records');
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
});
