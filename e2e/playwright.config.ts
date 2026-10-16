import fs from 'node:fs';
import { chromium, defineConfig, devices, webkit } from '@playwright/test';

// Use the browsers Playwright installed; fall back to a preinstalled Chromium (cloud sandboxes) or an explicit path.
function executable(envVar: string, bundled: () => string, fallbacks: string[] = []): string | undefined {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  try {
    if (fs.existsSync(bundled())) return undefined;
  } catch {}
  return fallbacks.find((p) => fs.existsSync(p));
}
const chromiumPath = executable('PW_CHROMIUM', () => chromium.executablePath(), ['/opt/pw-browsers/chromium']);
const webkitPath = executable('PW_WEBKIT', () => webkit.executablePath());
const chromeLaunch = chromiumPath ? { executablePath: chromiumPath } : {};
const webkitLaunch = webkitPath ? { executablePath: webkitPath } : {};

export default defineConfig({
  testDir: './tests',
  outputDir: './output/test-results',
  // Each worker runs its own server with a private data directory, so workers never share game state.
  fullyParallel: false,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: './output/report', open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions: chromeLaunch } },
    { name: 'chromium-phone', use: { ...devices['Pixel 7'], launchOptions: chromeLaunch } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 }, launchOptions: webkitLaunch } },
    { name: 'webkit-phone', use: { ...devices['iPhone 14'], launchOptions: webkitLaunch } },
  ],
});
