import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Hermetic by default: mock AI even when the shell has a Claude credential, and a throwaway data
// directory so nothing touches ../data. Test files that exercise the live paths opt in themselves.
const dataDir = path.join(os.tmpdir(), `s30-vitest-${process.pid}`);

export default defineConfig({
  test: {
    env: {
      AI_MODE: 'mock',
      DATA_DIR: dataDir,
      CLAUDE_CONFIG_DIR: path.join(dataDir, 'claude'),
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_AUTH_TOKEN: '',
      CLAUDE_CODE_OAUTH_TOKEN: '',
      CLAUDE_BINARY: '',
      GM_PASSWORD: 'vitest-password',
      PLAYER_KEY: '',
      SESSION_SECRET: 'vitest-secret',
      GOOGLE_MAPS_API_KEY: '',
      COOKIE_SECURE: '0',
    },
    globalSetup: ['./test/globalSetup.ts'],
    testTimeout: 30_000,
  },
});
