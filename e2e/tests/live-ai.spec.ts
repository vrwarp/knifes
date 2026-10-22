import { DEFAULT_SCENARIO, LIVE_AI, acceptDialogs, expect, releaseLayer2, test } from './fixtures';

// The AI on the night is live, not mocked: answers take seconds, can fail, can arrive late. These run
// the server with a credential and the stand-in Claude CLI, so the real Agent SDK path drives the
// phone and the console, slow answers and broken links included.
test.use({ serverEnv: LIVE_AI });

test.describe('ARCHIVE on a live link', () => {
  test.beforeEach(async ({ player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    await player.getByRole('tab', { name: 'archive' }).click();
  });

  test('a slow answer shows the processing lines, holds the input, then types out; the console sees it all', async ({ player, gm, app }) => {
    app.scenario({ default: { delayMs: 3000, tools: [{ name: 'read_personnel', args: { who: 'nina' } }], text: 'S30-003 NINA CALDER. INTELLIGENCE ANALYST.' } });
    await player.getByLabel('Query').fill('tell me about nina');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.getByRole('status').filter({ hasText: /ARCHIVE PROCESSING|SEARCHING|CROSS-CHECKING|SEGMENT|ASSEMBLING/ })).toBeVisible();
    await expect(player.getByRole('button', { name: /send/i })).toBeDisabled();
    await expect(gm.getByText('· answering').first()).toBeVisible();
    await expect(player.locator('.msg.assistant').last()).toContainText('INTELLIGENCE ANALYST', { timeout: 15_000 });
    await expect(player.getByText('tell me about nina', { exact: true })).toBeVisible();
    const transcript = gm.locator('.panel', { has: gm.locator('h2', { hasText: 'ARCHIVE transcript' }) });
    await expect(transcript).toContainText('tools: mcp__archive__read_personnel');
    await expect(transcript).toContainText(/\$0\.\d{3}/);
    await expect(gm.locator('.log .ev', { hasText: /archive tool/ }).first()).toBeVisible();
  });

  test('what he types while an answer is on its way is still in the box when the answer lands', async ({ player, app }) => {
    app.scenario({ rules: [{ when: { prompt: 'first question' }, do: { delayMs: 2500, text: 'FIRST ANSWER' } }], default: { text: 'SECOND ANSWER' } });
    await player.getByLabel('Query').fill('first question');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.getByRole('button', { name: /send/i })).toBeDisabled();
    await player.getByLabel('Query').fill('second question');
    await expect(player.locator('.msg.assistant').last()).toContainText('FIRST ANSWER', { timeout: 15_000 });
    await player.waitForTimeout(500);
    await expect(player.getByLabel('Query')).toHaveValue('second question');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant').last()).toContainText('SECOND ANSWER');
    await expect(player.getByLabel('Query')).toHaveValue('');
  });

  test('a broken link: the records still answer, the console sees why, and the next question is the AI again', async ({ player, gm, app }) => {
    app.scenario({ default: { exitCode: 1, stderr: 'API Error: 529 overloaded_error' } });
    await player.getByLabel('Query').fill('tell me about nina');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant').last()).toContainText('Nina Calder', { timeout: 15_000 });
    await expect(player.locator('.msg.system')).toHaveCount(0);
    await expect(gm.locator('.now .warn', { hasText: /AI error .* archive/ })).toBeVisible();
    await expect(gm.locator('.panel', { has: gm.locator('h2', { hasText: 'ARCHIVE transcript' }) })).toContainText('local index: the AI failed');
    app.scenario(DEFAULT_SCENARIO);
    await player.getByLabel('Query').fill('try again');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant').last()).toContainText('ARCHIVE: records retrieved.');
  });

  test('a new session while an answer is on its way clears the screen, and that answer never lands', async ({ player, gm, app }) => {
    acceptDialogs(gm);
    app.scenario({ rules: [{ when: { prompt: 'old question' }, do: { delayMs: 4000, text: 'THE OLD ANSWER' } }], default: { text: 'THE NEW ANSWER' } });
    await player.getByLabel('Query').fill('old question');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.getByRole('button', { name: /send/i })).toBeDisabled();
    await gm.getByRole('button', { name: /new archive session/i }).click();
    await expect(player.getByText('old question', { exact: true })).toHaveCount(0);
    await player.getByLabel('Query').fill('new question');
    await expect(player.getByRole('button', { name: /send/i })).toBeEnabled();
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant').last()).toContainText('THE NEW ANSWER');
    await player.waitForTimeout(4500);
    await expect(player.getByText('THE OLD ANSWER')).toHaveCount(0);
    await expect(gm.getByText('THE OLD ANSWER')).toHaveCount(0);
  });

  test('records released while an answer is on its way: that answer keeps what its tool saw, the next one has them', async ({ player, gm, app }) => {
    app.scenario({ default: { delayMs: 3000, tools: [{ name: 'read_classified', args: { who: 'nina' } }], text: '{tool0}' } });
    await player.getByLabel('Query').fill('read nina’s records');
    await player.getByRole('button', { name: /send/i }).click();
    // The console logs the tool call once the model has made it; only then do the records go out.
    await expect(gm.locator('.log .ev', { hasText: /archive tool/ }).first()).toBeVisible();
    await releaseLayer2(app);
    const overlay = player.getByRole('dialog', { name: /incoming transmission/i });
    await expect(overlay).toBeVisible();
    await overlay.getByRole('button', { name: /acknowledge/i }).click();
    await expect(player.locator('.msg.assistant').last()).toContainText('[NO RECORD]', { timeout: 15_000 });
    app.scenario({ default: { tools: [{ name: 'read_classified', args: { who: 'nina' } }], text: '{tool0}' } });
    await player.getByLabel('Query').fill('again');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant').last()).toContainText('Silver letter opener');
  });

  test('records released before the model reaches for them: the answer already has them', async ({ player, app }) => {
    app.scenario({ default: { tools: [{ name: 'read_classified', args: { who: 'nina' } }], text: '{tool0}' } });
    await releaseLayer2(app);
    await player.getByRole('dialog', { name: /incoming transmission/i }).getByRole('button', { name: /acknowledge/i }).click();
    await player.getByLabel('Query').fill('read nina’s records');
    await player.getByRole('button', { name: /send/i }).click();
    await expect(player.locator('.msg.assistant').last()).toContainText('Silver letter opener');
  });
});

test.describe('the console on a live link', () => {
  test('drafts a hint with the model, ready to edit and push', async ({ gm, app }) => {
    await app.setStage('gate');
    app.scenario({ default: { text: '', structured: { hint: 'Your code breaker answers to the old phrase.', rationale: 'three wrong codes in a row' } } });
    await gm.getByLabel('Hint strength').selectOption('clear');
    await gm.getByRole('button', { name: /^draft$/i }).click();
    await expect(gm.getByLabel('Transmission text')).toHaveValue('Your code breaker answers to the old phrase.');
    await expect(gm.getByText('Copilot: three wrong codes in a row [ai]')).toBeVisible();
  });

  test('a failed draft says so and leaves the editor usable', async ({ gm, app }) => {
    app.scenario({ default: { exitCode: 1, stderr: 'rate limit' } });
    await gm.getByRole('button', { name: /^draft$/i }).click();
    await expect(gm.getByText(/Draft failed: Copilot failed/)).toBeVisible({ timeout: 15_000 });
    await gm.getByLabel('Transmission text').fill('Typed by hand.');
    await expect(gm.getByRole('button', { name: /push to his screen/i })).toBeEnabled();
  });

  test('writes the case file with the model, for the GMs to preview and print', async ({ gm, player, app }) => {
    await app.setStage('investigation');
    await player.goto(app.base);
    app.scenario({ default: { text: '# CASE FILE 30-0214\n\n## Recovery Chain\nThe detective **recovered** the Ledger.\n\nFiled by ARCHIVE. Integrity restored.' } });
    await gm.getByRole('button', { name: /generate with ai/i }).click();
    await expect(gm.getByText(/Generated \d/)).toBeVisible({ timeout: 15_000 });
    await gm.getByRole('button', { name: /^preview$/i }).click();
    // The screen copy; a second, print-only copy sits hidden for window.print().
    const screen = gm.locator('.no-print .md');
    await expect(screen.locator('h2', { hasText: 'CASE FILE 30-0214' })).toBeVisible();
    await expect(screen.locator('strong', { hasText: 'recovered' })).toBeVisible();
    await expect(gm.locator('.print-only h2', { hasText: 'CASE FILE 30-0214' })).toBeHidden();
    await expect(player.getByText('CASE FILE 30-0214')).toHaveCount(0);
  });

  test('a failed AI report leaves the GMs the template to print, and says so', async ({ gm, app }) => {
    await app.setStage('investigation');
    app.scenario({ default: { exitCode: 1, stderr: 'API Error: 400 Your credit balance is too low' } });
    await gm.getByRole('button', { name: /generate with ai/i }).click();
    await expect(gm.getByText(/The AI failed .*template report/)).toBeVisible({ timeout: 15_000 });
    await gm.getByRole('button', { name: /^preview$/i }).click();
    await expect(gm.locator('.no-print .md h1, .no-print .md h2').first()).toBeVisible();
    await expect(gm.getByRole('button', { name: /^print$/i })).toBeEnabled();
  });

  test('shows the AI live on the key and proves the link with one tiny request', async ({ gm, app }) => {
    app.scenario({ rules: [{ when: { prompt: 'LINK OK' }, do: { text: 'LINK OK' } }], default: { text: 'unexpected' } });
    const panel = gm.locator('.panel.claude');
    await expect(gm.locator('.topbar')).toContainText(/AI\s*live/);
    await expect(panel).toContainText('API key (ANTHROPIC_API_KEY)');
    await expect(panel.getByRole('button', { name: /sign in with claude/i }), 'an API key outranks a console sign-in').toHaveCount(0);
    await panel.getByRole('button', { name: /test connection/i }).click();
    await expect(panel.getByRole('status')).toContainText(/Claude answered in \d+\.\d s: “LINK OK”/);
  });

  test('the setup assistant proposes through its tools and nothing changes until a GM applies', async ({ gm, app }) => {
    app.scenario({ default: { tools: [{ name: 'readiness_check' }, { name: 'propose_changes', args: { summary: 'Tighter radius', changes: [{ path: 'geo.radiusMeters', value: 150 }] } }], text: 'I checked readiness and proposed a tighter radius.' } });
    const panel = gm.locator('.panel.assistant');
    await expect(panel).toContainText('· Opus');
    await panel.getByLabel('Message the setup assistant').fill('Make the location harder');
    await panel.getByRole('button', { name: /^send$/i }).click();
    await expect(panel.locator('.msg.assistant')).toContainText('proposed a tighter radius');
    const proposal = panel.locator('.proposal');
    await expect(proposal).toContainText('geo.radiusMeters');
    expect((await app.config()).geo.radiusMeters).toBe(200);
    await proposal.getByRole('button', { name: /^apply$/i }).click();
    await expect.poll(async () => (await app.config()).geo.radiusMeters).toBe(150);
  });
});
