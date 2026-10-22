import { acceptDialogs, clearWord, clickAfterTyping, expect, noHorizontalScroll, test, typeWord } from './fixtures';

// The evening as it will run: the race (not solo), a pin on a real target, Phil's code, a lost race and a
// won one, the reveal, the interrogation with the ARCHIVE, Matt's call and the release, a hint, the report.
// The GM console is open next to the phone the whole time, the way Faith, Benji and Victor will have it.

test('the whole evening in race mode, phone and console side by side', async ({ player, gm, app }) => {
  test.setTimeout(150_000);
  acceptDialogs(gm);
  const c = await app.config();
  await app.patch((cfg) => {
    cfg.geo.target = { ...c.geo.mapCenter };
    cfg.geo.radiusMeters = 3000;
    // The party's race, sped up: two-guess scripts every 1.5 s so a lost round takes three seconds.
    Object.assign(cfg.hack, { mode: 'race', wordBank: ['STEALTH', 'PHANTOM', 'CIPHERS', 'COURIER'], aiPlanGuesses: 2, aiPlanJitter: 0, aiIntervalSeconds: 1.5, aiJitterSeconds: 0, aiSlowdownPerRound: 4 });
  });

  // QR landing.
  await player.goto(app.base);
  await clickAfterTyping(player, player.getByRole('button', { name: /initiate recovery protocol/i }));
  await expect(gm.locator('.chip.now', { hasText: /field transmission/i })).toBeVisible();

  // The drop near Lake Elizabeth: one miss, then the pin on the spot.
  await player.getByRole('button', { name: /tap to unlock map/i }).click();
  const map = player.locator('.map');
  await map.click({ position: { x: 3, y: 3 } });
  await player.getByRole('button', { name: /triangulate/i }).click();
  await expect(player.getByText(/SIGNAL MISMATCH/)).toBeVisible();
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await player.getByRole('button', { name: /triangulate/i }).click();
  await expect(player.getByText('LOCATION CONFIRMED')).toBeVisible();
  await expect(player.getByRole('link', { name: /open in google maps/i })).toHaveAttribute('href', new RegExp(`query=${c.geo.mapCenter.lat},${c.geo.mapCenter.lng}$`));
  await player.getByRole('button', { name: /proceed/i }).click();

  // Phil's call: a misheard code, then the right one, with the console showing both.
  await expect(player.locator('h1', { hasText: 'Secure line' })).toBeVisible();
  await expect(gm.getByTestId('ledger-panel')).toContainText('S30GHOST');
  await typeWord(player, 'S30GOST');
  await player.getByRole('button', { name: /submit key/i }).click();
  await expect(player.getByText('KEY REJECTED')).toBeVisible();
  await expect(gm.getByText(/last wrong: S30GOST/)).toBeVisible();
  await clearWord(player);
  await typeWord(player, 'S30GHOST');
  await player.getByRole('button', { name: /submit key/i }).click();

  // The race: the adversary takes the first key, Jimmy takes the second.
  await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
  await expect(player.getByRole('status').filter({ hasText: /race 1 lost/i })).toBeVisible({ timeout: 20_000 });
  await expect(gm.getByText(/races lost 1/)).toBeVisible();
  const { state } = await (await app.gmApi('/api/gm/overview')).json();
  expect(state.hack.round).toBe(2);
  await typeWord(player, state.hack.secret);
  await player.getByRole('button', { name: /attempt key/i }).click();
  await expect(player.getByText('KEY ACCEPTED')).toBeVisible();

  // The Ledger is decrypted; back to headquarters.
  await expect(player.locator('h1', { hasText: 'LEDGER DECRYPTED' })).toBeVisible();
  await clickAfterTyping(player, player.getByRole('button', { name: /return to headquarters/i }));
  await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
  await expect(player.locator('.agent header', { hasText: 'Nina Calder' })).toBeVisible();
  await expect(player.getByText(/SURVEILLANCE/)).toHaveCount(0);

  // The interrogation: he questions the ARCHIVE before the release.
  await player.getByRole('tab', { name: 'archive' }).click();
  await player.getByLabel('Query').fill('where was everyone at 2:14');
  await player.getByRole('button', { name: /send/i }).click();
  await expect(player.locator('.msg.assistant').last()).toContainText('[NO RECORD]');
  await expect(gm.locator('.panel', { has: gm.locator('h2', { hasText: 'ARCHIVE transcript' }) })).toContainText('where was everyone at 2:14');

  // Matt's call: the GM releases the records; the transmission takes over the phone.
  await gm.getByRole('button', { name: /^call 2$/i }).click();
  await expect(gm.getByTestId('ledger-panel')).toContainText('MATT: Jimmy');
  await gm.getByRole('button', { name: /^release records$/i }).click();
  const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
  await expect(overlay).toContainText('SECOND AUTHORIZATION RECEIVED');
  await overlay.getByRole('button', { name: /acknowledge/i }).click();
  await expect(player.getByRole('tab', { name: 'ledger' }).locator('.fresh-dot')).toBeVisible();
  await player.getByRole('tab', { name: 'ledger' }).click();
  await player.locator('.agent.l2 header', { hasText: 'Nina Calder' }).click();
  await expect(player.getByText('Silver letter opener')).toBeVisible();
  await noHorizontalScroll(player);

  // He asks again, now with the records out.
  await player.getByRole('tab', { name: 'archive' }).click();
  await player.getByLabel('Query').fill('where was everyone at 2:14');
  await player.getByRole('button', { name: /send/i }).click();
  await expect(player.locator('.msg.assistant').last()).toContainText('Nina Calder: Confirmed inside the office.');

  // A nudge from the console.
  await gm.locator('.quick-row').first().getByRole('button', { name: /^send$/i }).click();
  await expect(player.getByRole('dialog', { name: /incoming transmission/i })).toBeVisible();
  await player.getByRole('dialog', { name: /incoming transmission/i }).getByRole('button', { name: /acknowledge/i }).click();
  await expect(player.getByRole('button', { name: /transmissions \(2\)/i })).toBeVisible();

  // He names the killer at the table; the GMs print the case file.
  await gm.getByRole('button', { name: /generate with ai/i }).click();
  await expect(gm.getByText(/Generated \d/)).toBeVisible({ timeout: 15_000 });
  await expect(player.getByText('CASE FILE 30-0214')).toHaveCount(0);

  const events = (await (await app.gmApi('/api/gm/overview')).json()).events as { type: string }[];
  for (const t of ['game_start', 'geo_guess', 'gate_attempt', 'hack_round_lost', 'hack_solved', 'archive_user', 'ledger_release', 'hint_pushed', 'report']) expect(events.map((e) => e.type), t).toContain(t);
});
