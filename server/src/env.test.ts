import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectCredential } from './env.js';

describe('detectCredential', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-env-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports none with no credential anywhere', () => {
    expect(detectCredential({}, dir)).toBe('none');
  });
  it('finds a subscription token', () => {
    expect(detectCredential({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-x' }, dir)).toBe('oauth_token');
  });
  it('lets an API key outrank the subscription token, like the CLI does', () => {
    expect(detectCredential({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-x', ANTHROPIC_API_KEY: 'sk-ant-api' }, dir)).toBe('api_key');
  });
  it('finds a login written into the config dir', () => {
    fs.writeFileSync(path.join(dir, '.credentials.json'), '{}');
    expect(detectCredential({}, dir)).toBe('login');
  });
  it('ignores blank values', () => {
    expect(detectCredential({ ANTHROPIC_API_KEY: '  ', CLAUDE_CODE_OAUTH_TOKEN: '' }, dir)).toBe('none');
  });
});
