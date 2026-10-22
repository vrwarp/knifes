import { FAKE_CLAUDE, acceptDialogs, expect, test } from './fixtures';

// A server whose Claude Code binary is a stand-in, with no credential in the environment,
// so the GM console's web sign-in is the only way to link the AI.
test.use({
  serverEnv: { AI_MODE: 'auto', CLAUDE_BINARY: FAKE_CLAUDE, CLAUDE_CODE_OAUTH_TOKEN: '', ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' },
});

test.describe('Claude link', () => {
  test.afterEach(async ({ app }) => {
    await app.gmApi('/api/gm/claude/logout', { method: 'POST' });
  });

  test('signs the container in from the GM console and back out', async ({ gm }) => {
    acceptDialogs(gm);
    const panel = gm.locator('.panel.claude');
    await expect(panel).toContainText('mock · not linked');
    await expect(gm.locator('.topbar')).toContainText(/AI\s*mock/);

    await panel.getByRole('button', { name: /sign in with claude/i }).click();
    const link = panel.getByRole('link', { name: /open claude sign-in/i });
    await expect(link).toHaveAttribute('href', /^https:\/\/claude\.ai\/oauth\/authorize\?.*state=abc123$/);
    await expect(link).toHaveAttribute('target', '_blank');

    await panel.getByLabel('Claude sign-in code').fill('good-code');
    await panel.getByRole('button', { name: /link claude/i }).click();
    await expect(panel.getByRole('status')).toContainText('The AI is live');
    await expect(gm.locator('.topbar')).toContainText(/AI\s*live/);
    await expect(panel).toContainText('subscription login');

    await panel.getByRole('button', { name: /^sign out$/i }).click();
    await expect(panel).toContainText('mock · not linked');
    await expect(gm.locator('.topbar')).toContainText(/AI\s*mock/);
  });

  test('a wrong code is refused and leaves the AI unlinked', async ({ gm, app }) => {
    const panel = gm.locator('.panel.claude');
    await panel.getByRole('button', { name: /sign in with claude/i }).click();
    await panel.getByLabel('Claude sign-in code').fill('wrong-code');
    await panel.getByRole('button', { name: /link claude/i }).click();
    await expect(panel.getByRole('alert')).toContainText('Invalid authorization code');
    await expect(panel.getByRole('button', { name: /sign in with claude/i })).toBeVisible();
    const s = await (await app.gmApi('/api/gm/claude')).json();
    expect(s.mode).toBe('mock');
    expect(s.hasLoginFile).toBe(false);
  });

  test('cancel stops a half-finished sign-in', async ({ gm, app }) => {
    const panel = gm.locator('.panel.claude');
    await panel.getByRole('button', { name: /sign in with claude/i }).click();
    await expect(panel.getByRole('link', { name: /open claude sign-in/i })).toBeVisible();
    await panel.getByRole('button', { name: /^cancel$/i }).click();
    await expect(panel.getByRole('button', { name: /sign in with claude/i })).toBeVisible();
    // The panel clears before the cancel request lands on the server.
    await expect.poll(async () => (await (await app.gmApi('/api/gm/claude')).json()).inProgress).toBeNull();
  });

  test('the sign-in endpoints need the GM password', async ({ app, request }) => {
    expect((await request.post(`${app.base}/api/gm/claude/login/start`)).status()).toBe(401);
    expect((await request.get(`${app.base}/api/gm/claude`)).status()).toBe(401);
  });
});
