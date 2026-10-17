#!/usr/bin/env node
// Stand-in for the Claude Code binary in the sign-in tests. It mimics `claude auth login`
// (prints a link, waits for a pasted code) and `claude auth status`; anything else fails fast.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const args = process.argv.slice(2);
const dir = process.env.CLAUDE_CONFIG_DIR ?? '.';
const creds = path.join(dir, '.credentials.json');

if (args[0] === 'auth' && args[1] === 'status') process.exit(fs.existsSync(creds) ? 0 : 1);

if (args[0] === 'auth' && args[1] === 'login') {
  process.stdout.write('Opening browser to sign in…\nIf the browser did not open, visit: https://claude.ai/oauth/authorize?code=true&client_id=test&state=abc123\n');
  process.stdout.write('Paste code here if prompted > ');
  const rl = readline.createInterface({ input: process.stdin });
  rl.once('line', (line) => {
    if (line.trim() === 'good-code') {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(creds, JSON.stringify({ claudeAiOauth: { accessToken: 'fake', refreshToken: 'fake', expiresAt: Date.now() + 3600e3 } }));
      process.stdout.write('Login successful.\n');
      process.exit(0);
    }
    process.stderr.write('Login failed: Invalid authorization code\n');
    process.exit(1);
  });
} else {
  process.stderr.write('fake claude: unsupported command\n');
  process.exit(1);
}
