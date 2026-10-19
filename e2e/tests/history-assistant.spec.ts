import { acceptDialogs, configSection, expect, test } from './fixtures';

test.describe('configuration version history', () => {
  test('every save is a version, and an old version can be restored without losing the newer one', async ({ gm, app }) => {
    acceptDialogs(gm);
    const startVersion = (await app.config()).version;
    const gate = await configSection(gm, 'Code gate');
    const prompt = gate.locator('textarea').first();
    await prompt.fill('Call Phil now.');
    await gm.getByRole('button', { name: /save config/i }).click();
    await expect(gm.getByText('Saved and pushed')).toBeVisible();

    const history = await configSection(gm, 'Version history');
    const latest = history.locator('li.current');
    await expect(latest).toContainText(`v${startVersion + 1}`);
    await expect(latest).toContainText('Saved from the config editor');
    await expect(latest).toContainText('gate.prompt');
    await expect(latest).toContainText('live');

    // Open the version before the edit: it shows what a restore would change, then restore it.
    await history.getByRole('button', { name: new RegExp(`^v${startVersion}\\b`) }).click();
    await expect(history.locator('table.diff')).toContainText('gate.prompt');
    await expect(history.locator('table.diff')).toContainText('Call Phil now.');
    await history.getByRole('button', { name: `Restore v${startVersion}` }).click();
    await expect(history.getByRole('status')).toContainText(`Restored version ${startVersion} as version ${startVersion + 2}`);
    await expect(history.locator('li.current')).toContainText('Restored version');
    expect((await app.config()).gate.prompt).not.toBe('Call Phil now.');

    // The edit is still in the log and can be brought back.
    await history.getByRole('button', { name: new RegExp(`^v${startVersion + 1}\\b`) }).click();
    await history.getByRole('button', { name: `Restore v${startVersion + 1}` }).click();
    await expect.poll(async () => (await app.config()).gate.prompt).toBe('Call Phil now.');
  });

  test('the API refuses to restore the version that is already live', async ({ app }) => {
    const v = (await app.config()).version;
    const r = await app.gmApi('/api/gm/config/restore', { json: { version: v } });
    expect(r.status).toBe(409);
  });

  test('removing an upload keeps the file so an older version can bring it back', async ({ app, request }) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 'p.png');
    const { id } = await (await app.gmApi('/api/gm/upload?kind=photo', { body: fd })).json();
    const withPhoto = (await app.config()).version;
    await app.gmApi(`/api/gm/upload/${id}`, { method: 'DELETE' });
    expect((await app.config()).geo.photos).not.toContain(id);
    expect((await request.get(`${app.base}/uploads/${id}`)).ok()).toBeTruthy();
    const history = await (await app.gmApi('/api/gm/config/history')).json();
    expect(history.versions[0]).toMatchObject({ source: 'upload', note: 'Removed an upload' });
    await app.gmApi('/api/gm/config/restore', { json: { version: withPhoto } });
    expect((await app.config()).geo.photos).toContain(id);
  });
});

test.describe('setup assistant (mock mode)', () => {
  test('shows what is missing and answers with the readiness list', async ({ gm }) => {
    const panel = gm.locator('.panel.assistant');
    await expect(panel.locator('.readiness')).toContainText(/blocking/);
    await expect(panel.locator('.readiness')).toContainText('No target pin is set');
    await panel.getByRole('button', { name: 'What is still missing before the party?' }).click();
    await expect(panel.locator('.msg.user')).toContainText('What is still missing before the party?');
    await expect(panel.locator('.msg.assistant')).toContainText('No field photos are uploaded');
  });

  test('an edit arrives as a proposal and only changes the game when a GM applies it', async ({ gm, app }) => {
    const panel = gm.locator('.panel.assistant');
    const box = panel.getByLabel('Message the setup assistant');
    await box.fill('set gate.code to "PHIL2026"');
    await panel.getByRole('button', { name: /^send$/i }).click();
    const proposal = panel.locator('.proposal');
    await expect(proposal).toContainText('gate.code');
    await expect(proposal).toContainText('"PHIL2026"');
    expect((await app.config()).gate.code).toBe('S30GHOST');

    await proposal.getByRole('button', { name: /^apply$/i }).click();
    await expect(proposal).toHaveCount(0);
    await expect.poll(async () => (await app.config()).gate.code).toBe('PHIL2026');
    const history = await (await app.gmApi('/api/gm/config/history')).json();
    expect(history.versions[0]).toMatchObject({ source: 'assistant', note: 'Assistant: Set gate.code', changes: ['gate.code'] });
    await expect(panel).toContainText(/#\d+ applied as v\d+/);
  });

  test('a dismissed proposal changes nothing, and a bad path is explained', async ({ gm, app }) => {
    const panel = gm.locator('.panel.assistant');
    const box = panel.getByLabel('Message the setup assistant');
    await box.fill('set geo.radiusMeters to 90');
    await panel.getByRole('button', { name: /^send$/i }).click();
    await panel.locator('.proposal').getByRole('button', { name: /^dismiss$/i }).click();
    await expect(panel.locator('.proposal')).toHaveCount(0);
    expect((await app.config()).geo.radiusMeters).toBe(200);

    await box.fill('set gate.nothing to 1');
    await panel.getByRole('button', { name: /^send$/i }).click();
    await expect(panel.locator('.msg.assistant').last()).toContainText('No such setting: gate.nothing');
  });

  test('a second GM sees the conversation live, and the player never receives it', async ({ gm, player, app, browser }, testInfo) => {
    const frames: string[] = [];
    player.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    await player.goto(app.base);
    await expect(player.getByRole('button', { name: /initiate recovery protocol/i })).toBeVisible();

    const { newGmPage } = await import('./fixtures');
    const second = await newGmPage(browser, app, testInfo);
    await second.page.goto(`${app.base}/gm`);
    await expect(second.page.locator('.panel.assistant')).toBeVisible();

    const panel = gm.locator('.panel.assistant');
    await panel.getByLabel('Message the setup assistant').fill('The culprit is Nina Calder, right?');
    await panel.getByRole('button', { name: /^send$/i }).click();
    await expect(second.page.locator('.panel.assistant .msg.user')).toContainText('The culprit is Nina Calder, right?');
    await expect(second.page.locator('.panel.assistant .msg.assistant').last()).toBeVisible();
    await second.context.close();

    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f).not.toContain('"assistant');
      expect(f).not.toContain('Nina Calder');
    }
  });

  test('a new conversation clears the chat but keeps proposals and history', async ({ gm, app }) => {
    acceptDialogs(gm);
    const panel = gm.locator('.panel.assistant');
    await panel.getByLabel('Message the setup assistant').fill('set gate.code to "KEEPME12"');
    await panel.getByRole('button', { name: /^send$/i }).click();
    await expect(panel.locator('.proposal')).toBeVisible();
    await panel.getByRole('button', { name: /new conversation/i }).click();
    await expect(panel.locator('.msg')).toHaveCount(0);
    await expect(panel.locator('.proposal')).toContainText('KEEPME12');
    const view = await (await app.gmApi('/api/gm/assistant')).json();
    expect(view.messages).toHaveLength(0);
  });
});

test('GM-only endpoints refuse the player', async ({ app, request }) => {
  for (const p of ['/api/gm/assistant', '/api/gm/config/history']) expect((await request.get(`${app.base}${p}`)).status()).toBe(401);
  expect((await request.post(`${app.base}/api/gm/config/restore`, { data: { version: 1 } })).status()).toBe(401);
});
