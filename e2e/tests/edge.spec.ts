import { acceptDialogs, clickAfterTyping, configSection, expect, finishTyping, noHorizontalScroll, startGame, test, typeWord } from './fixtures';

const overview = async (app: { gmApi: (p: string) => Promise<Response> }) => (await (await app.gmApi('/api/gm/overview')).json()) as { state: Record<string, any>; config: Record<string, any> };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('the GMs change things while he plays', () => {
  test('a typo fixed in a personnel file reaches the open phone without a reload', async ({ player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    const notes = player.locator('.agent .notes').first();
    await expect(notes).toContainText('antique military memorabilia');
    await app.patch((c) => (c.ledger.content.agents[0].profile = 'Strict about protocol. Keeps a framed service medal on her desk.'));
    await expect(notes).toContainText('framed service medal');
    await expect(notes).not.toContainText('antique military memorabilia');
  });

  test('a surveillance line corrected after the release reaches the open phone too', async ({ player, app }) => {
    await app.setStage('investigation');
    await app.gmApi('/api/gm/ledger/release', { json: { released: true } });
    await player.goto(app.base);
    await player.getByRole('dialog', { name: /incoming transmission/i }).getByRole('button', { name: /acknowledge/i }).click();
    await player.locator('.agent.l2 header', { hasText: 'Nina Calder' }).click();
    await expect(player.getByText('Silver letter opener')).toBeVisible();
    await app.patch((c) => {
      const nina = c.ledger.content.agents.find((a: { name: string }) => a.name === 'Nina Calder');
      nina.evidence = nina.evidence.map((e: string) => (e === 'Silver letter opener' ? 'Brass letter opener' : e));
    });
    await expect(player.getByText('Brass letter opener')).toBeVisible();
    await expect(player.getByText('Silver letter opener')).toHaveCount(0);
  });

  test('a photo uploaded in the middle of an edit is no conflict, and the save keeps both', async ({ gm, app }) => {
    const geo = await configSection(gm, 'Location puzzle');
    const title = geo.getByLabel('Reveal title');
    await title.fill('DROP POINT CONFIRMED');
    await geo.locator('input[type=file]').setInputFiles({ name: 'drop.png', mimeType: 'image/png', buffer: PNG });
    await expect(gm.getByText(/^Uploaded /)).toBeVisible();
    await expect(gm.getByText(/Another GM saved a newer configuration/)).toHaveCount(0);
    await gm.getByRole('button', { name: /save config/i }).click();
    await expect(gm.getByText('Saved and pushed to the player')).toBeVisible();
    const { config } = await overview(app);
    expect(config.geo.revealTitle).toBe('DROP POINT CONFIRMED');
    expect(config.geo.photos).toHaveLength(1);
  });
});

test.describe('the phone, tapped the way people tap', () => {
  test('from the secure line he can look at the location again and come back', async ({ player, app }) => {
    const c = await app.config();
    await app.patch((cfg) => {
      cfg.geo.target = { ...c.geo.mapCenter };
      cfg.geo.radiusMeters = 3000;
    });
    await startGame(player, app.base);
    await player.getByRole('button', { name: /tap to unlock map/i }).click();
    const map = player.locator('.map');
    const box = (await map.boundingBox())!;
    await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await player.getByRole('button', { name: /triangulate/i }).click();
    await expect(player.getByText('LOCATION CONFIRMED')).toBeVisible();
    await player.getByRole('button', { name: /proceed/i }).click();
    await expect(player.locator('h1', { hasText: 'Secure line' })).toBeVisible();
    await player.getByRole('button', { name: /back to location/i }).click();
    await expect(player.getByText('LOCATION CONFIRMED')).toBeVisible();
    await expect(player.getByRole('link', { name: /open in google maps/i })).toBeVisible();
    expect((await overview(app)).state.stage, 'looking back moves nothing on the server').toBe('gate');
    await player.getByRole('button', { name: /return to secure line/i }).click();
    await expect(player.locator('h1', { hasText: 'Secure line' })).toBeVisible();
    // Looking back again, then the GMs move him on: the phone follows the game, not the look-back.
    await player.getByRole('button', { name: /back to location/i }).click();
    await app.setStage('hack');
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible();
  });

  test('a double tap on ENTER sends one code, one guess and one question', async ({ player, app }) => {
    await app.setStage('gate');
    await player.goto(app.base);
    await typeWord(player, 'WRONG1');
    await player.getByRole('button', { name: /submit key/i }).dblclick();
    await expect(player.getByText('KEY REJECTED')).toBeVisible();
    await expect.poll(async () => (await overview(app)).state.gate.attempts).toBe(1);
    await player.waitForTimeout(500);
    expect((await overview(app)).state.gate.attempts).toBe(1);

    await app.patch((c) => Object.assign(c.hack, { mode: 'race', aiIntervalSeconds: 600, aiJitterSeconds: 0 }));
    await app.setStage('hack');
    // The gate's keyboard is still up until the race screen arrives with its briefing.
    await expect(player.getByRole('dialog').getByRole('button', { name: /engage/i })).toBeVisible();
    await typeWord(player, 'PLANTER');
    await player.getByRole('button', { name: /attempt key/i }).dblclick();
    await expect(player.getByRole('img', { name: /^Attempt 1: P / })).toBeVisible();
    await player.waitForTimeout(500);
    expect((await overview(app)).state.hack.guesses).toEqual(['PLANTER']);

    await app.setStage('investigation');
    await player.getByRole('tab', { name: 'archive' }).click();
    await player.getByLabel('Query').fill('who had the keycard');
    await player.getByRole('button', { name: /send/i }).dblclick();
    await player.getByLabel('Query').press('Enter');
    await expect(player.locator('.msg.assistant').last()).not.toContainText('ARCHIVE ONLINE');
    await player.waitForTimeout(500);
    await expect(player.getByText('who had the keycard', { exact: true })).toHaveCount(1);
    await expect(player.getByRole('alert')).toHaveCount(0);
    const transcript = (await (await app.gmApi('/api/gm/overview')).json()).archive as { role: string }[];
    expect(transcript.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  test('two phones on the one game follow each other, and a transmission reaches both', async ({ player, browser, app }) => {
    const other = await browser.newPage();
    await player.goto(app.base);
    await other.goto(app.base);
    await clickAfterTyping(player, player.getByRole('button', { name: /initiate recovery protocol/i }));
    await expect(other.getByRole('button', { name: /tap to unlock map/i })).toBeVisible();
    await app.gmApi('/api/gm/hint', { json: { text: 'For both screens.' } });
    for (const p of [player, other]) await expect(p.getByRole('dialog', { name: /incoming transmission/i })).toContainText('For both screens.');
    await other.close();
  });
});

test.describe('screens and settings people really have', () => {
  for (const [name, viewport] of [
    ['a 320px phone (iPhone SE, first generation)', { width: 320, height: 568 }],
    ['a phone turned sideways', { width: 844, height: 390 }],
  ] as const) {
    test(`every screen works on ${name}`, async ({ browser, app }, testInfo) => {
      test.skip(!testInfo.project.use.isMobile, 'phone sizes are for the phone projects');
      const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: testInfo.project.use.userAgent });
      const page = await ctx.newPage();
      for (const stage of ['intro', 'geo', 'gate', 'hack', 'reveal', 'investigation']) {
        await app.setStage(stage);
        await page.goto(app.base);
        await expect(page.locator('h1, [role=tab]').first()).toBeVisible();
        await finishTyping(page);
        await noHorizontalScroll(page);
        // Whatever moves the game on can be reached by scrolling to it.
        const cta = page.locator('.btn.primary:visible, .key:visible').last();
        if (await cta.count()) {
          await cta.scrollIntoViewIfNeeded();
          await expect(cta).toBeInViewport();
        }
      }
      // A transmission fits, and its Acknowledge can be reached.
      await app.gmApi('/api/gm/hint', { json: { text: 'Compare what each agent told you with the badge log. '.repeat(12) } });
      const overlay = page.getByRole('dialog', { name: /incoming transmission/i });
      await expect(overlay).toBeVisible();
      await noHorizontalScroll(page);
      const ack = overlay.getByRole('button', { name: /acknowledge/i });
      await ack.scrollIntoViewIfNeeded();
      await expect(ack).toBeInViewport();
      await ack.click();
      await expect(overlay).toHaveCount(0);
      await ctx.close();
    });
  }

  test('text longer than anyone planned wraps instead of pushing the screen sideways', async ({ player, app }) => {
    // One unbroken word as long as each field allows: a name is up to 60 characters, a profile up to 1000.
    const long = 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS'.repeat(6);
    await app.patch((c) => {
      c.ledger.content.agents[0].name = `M${'A'.repeat(59)}`;
      c.ledger.content.agents[0].position = 'X'.repeat(60);
      c.ledger.content.agents[0].profile = `${long} ${'A very long profile sentence. '.repeat(25)}`.slice(0, 1000);
      c.reveal.body = `${long}\n\n${'The rest of the reveal goes on and on. '.repeat(30)}`;
    });
    await app.setStage('reveal');
    await player.goto(app.base);
    await expect(player.locator('h1', { hasText: 'LEDGER DECRYPTED' })).toBeVisible();
    await finishTyping(player);
    await noHorizontalScroll(player);
    await clickAfterTyping(player, player.getByRole('button', { name: /return to headquarters/i }));
    await expect(player.getByRole('tab', { name: 'ledger' })).toBeVisible();
    await noHorizontalScroll(player);
    await app.gmApi('/api/gm/hint', { json: { text: `https://example.com/${long}/${long}` } });
    await expect(player.getByRole('dialog', { name: /incoming transmission/i })).toBeVisible();
    await noHorizontalScroll(player);
    await player.getByRole('dialog', { name: /incoming transmission/i }).getByRole('button', { name: /acknowledge/i }).click();
    await player.getByRole('tab', { name: 'archive' }).click();
    await player.getByLabel('Query').fill(long);
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.user').last()).toBeVisible();
    await noHorizontalScroll(player);
  });

  test('with storage blocked (private browsing, strict settings) the game still plays, transmissions included', async ({ browser, app }, testInfo) => {
    const ctx = await browser.newContext({ viewport: testInfo.project.use.viewport, isMobile: testInfo.project.use.isMobile, hasTouch: testInfo.project.use.hasTouch, userAgent: testInfo.project.use.userAgent });
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    const page = await ctx.newPage();
    await startGame(page, app.base);
    await expect(page.getByRole('button', { name: /tap to unlock map/i })).toBeVisible();
    await app.setStage('hack');
    await expect(page.getByRole('dialog').getByRole('button', { name: /engage/i })).toBeVisible();
    await typeWord(page, 'PLANTER');
    await page.getByRole('button', { name: /attempt key/i }).click();
    await expect(page.getByRole('img', { name: /^Attempt 1: P / })).toBeVisible();
    await app.setStage('investigation');
    await app.gmApi('/api/gm/hint', { json: { text: 'Storage or not.' } });
    const overlay = page.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toContainText('Storage or not.');
    await overlay.getByRole('button', { name: /acknowledge/i }).click();
    await expect(overlay).toHaveCount(0);
    await page.waitForTimeout(800);
    await expect(overlay, 'acknowledged stays acknowledged while the page is open').toHaveCount(0);
    await ctx.close();
  });

  test('with reduced motion the text is there at once and every button works', async ({ browser, app }, testInfo) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: testInfo.project.use.viewport, isMobile: testInfo.project.use.isMobile, hasTouch: testInfo.project.use.hasTouch, userAgent: testInfo.project.use.userAgent });
    const page = await ctx.newPage();
    await page.goto(app.base);
    // No typing out, so the start button is live without tapping the text.
    await expect(page.getByRole('button', { name: /initiate recovery protocol/i })).toBeEnabled({ timeout: 2000 });
    await page.getByRole('button', { name: /initiate recovery protocol/i }).click();
    await app.setStage('reveal');
    await expect(page.getByRole('button', { name: /return to headquarters/i })).toBeEnabled({ timeout: 2000 });
    await page.getByRole('button', { name: /return to headquarters/i }).click();
    await expect(page.getByRole('tab', { name: 'ledger' })).toBeVisible();
    await ctx.close();
  });
});

test.describe('when something breaks anyway', () => {
  test('a view the phone cannot draw shows the in-world fault screen, and it heals by itself once the view is good', async ({ player, app }) => {
    acceptDialogs(player);
    await app.setStage('hack');
    let broken = true;
    // Only plain requests: the live link is refused, so the bad view cannot be overwritten by a good push.
    await player.routeWebSocket(/\/ws/, (ws) => ws.close({ code: 1011 }));
    await player.route('**/api/player/state', async (r) => {
      if (!broken) return r.continue();
      const res = await r.fetch();
      const v = await res.json();
      v.hack = null;
      await r.fulfill({ response: res, json: v });
    });
    await player.goto(app.base);
    await expect(player.getByText('Signal interrupted')).toBeVisible();
    await expect(player.getByRole('button', { name: /reload/i })).toBeVisible();
    broken = false;
    await expect(player.locator('h1', { hasText: 'Brute-force key' })).toBeVisible({ timeout: 15_000 });
  });

  test('a console panel that cannot draw shows its fault screen and the game keeps running', async ({ gmContext, player, app }) => {
    const gm = await gmContext.newPage();
    let broken = true;
    await gm.routeWebSocket(/\/ws/, (ws) => ws.close({ code: 1011 }));
    await gm.route('**/api/gm/overview', async (r) => {
      if (!broken) return r.continue();
      const res = await r.fetch();
      const o = await res.json();
      o.state.hack = null;
      await r.fulfill({ response: res, json: o });
    });
    await gm.goto(`${app.base}/gm`);
    await expect(gm.getByText('Console error')).toBeVisible();
    // The phone is not affected at all.
    await startGame(player, app.base);
    await expect(player.getByRole('button', { name: /tap to unlock map/i })).toBeVisible();
    broken = false;
    await expect(gm.getByText('GM console').first()).toBeVisible({ timeout: 15_000 });
  });
});
