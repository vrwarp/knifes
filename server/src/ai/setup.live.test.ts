import { arg, callLog, scenario, until } from '../../test/live.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Db } from '../db.js';
import { DEFAULT_CONFIG } from '../defaultConfig.js';
import { env } from '../env.js';
import { GameService } from '../service.js';
import { SETUP_SYSTEM_PROMPT } from './setup.js';

// The setup assistant on a live credential: its tools answer through the SDK, and it can only propose.

let dir: string;
let db: Db;
let svc: GameService;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-setup-'));
  db = new Db(path.join(dir, 't.sqlite'));
  const c = structuredClone(DEFAULT_CONFIG);
  c.hack.mode = 'solo';
  db.appendConfig(c, 'system', 'test seed', []);
  svc = new GameService(db);
});
afterEach(() => {
  svc.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('setup assistant, live', () => {
  it('reads the game through its tools and can only propose an edit, which waits for a GM', async () => {
    const log = callLog();
    scenario({
      default: {
        tools: [
          { name: 'readiness_check' },
          { name: 'get_config' },
          { name: 'get_case_files' },
          { name: 'list_versions' },
          { name: 'propose_changes', args: { summary: 'Phil reads a new code', changes: [{ path: 'gate.code', value: 'PHIL2026' }] } },
        ],
        text: 'Done: {tool4}',
      },
    });
    const reply = await svc.assistantSend('What is missing, and change the code to PHIL2026');
    expect(reply.role).toBe('assistant');
    expect(reply.text).toMatch(/Proposal #\d+ is waiting for a GM to press Apply/);
    const [turn] = log();
    expect(turn.system).toBe(SETUP_SYSTEM_PROMPT);
    expect(turn.mcpTools.setup.sort()).toEqual(['get_case_files', 'get_config', 'list_versions', 'propose_changes', 'readiness_check', 'view_photo']);
    expect(arg(turn, '--allowedTools')).toBe('mcp__setup__*');
    expect(arg(turn, '--max-turns')).toBe('16');
    expect(arg(turn, '--effort')).toBe('high');
    const [ready, config, files, versions] = turn.toolResults.map((r) => r.text);
    expect(ready).toMatch(/\[blocker\] Location puzzle: No target pin is set/);
    expect(JSON.parse(config).gate.code).toBe('S30GHOST');
    expect(files).toContain('Silver letter opener');
    expect(versions).toMatch(/^v1 .* system: test seed/);
    // Nothing changed until a GM applies it.
    expect(svc.config.gate.code).toBe('S30GHOST');
    const pending = svc.proposals().find((p) => p.status === 'pending')!;
    expect(pending.preview).toEqual([{ path: 'gate.code', now: '"S30GHOST"', next: '"PHIL2026"' }]);
    svc.applyProposal(pending.id);
    expect(svc.config.gate.code).toBe('PHIL2026');
  });

  it('a proposal for a setting that does not exist is refused back to the model with the reason', async () => {
    const log = callLog();
    scenario({ default: { tools: [{ name: 'propose_changes', args: { summary: 'bad', changes: [{ path: 'gate.nothing', value: 1 }] } }, { name: 'propose_changes', args: { summary: 'pollute', changes: [{ path: '__proto__.polluted', value: 1 }] } }], text: '{tool0} / {tool1}' } });
    await svc.assistantSend('try');
    const [a, b] = log()[0].toolResults;
    expect(a).toMatchObject({ isError: true });
    expect(a.text).toMatch(/Not proposed: No such setting: gate\.nothing/);
    expect(b).toMatchObject({ isError: true });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(svc.proposals()).toHaveLength(0);
  });

  it('looks at an uploaded photo, and only at uploads', async () => {
    fs.mkdirSync(env.uploadsDir, { recursive: true });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(path.join(env.uploadsDir, 'photo-test1.png'), png);
    const log = callLog();
    scenario({ default: { tools: [{ name: 'view_photo', args: { id: 'photo-test1.png' } }, { name: 'view_photo', args: { id: '../../../etc/passwd' } }, { name: 'view_photo', args: { id: 'photo-missing.jpg' } }], text: 'ok' } });
    await svc.assistantSend('look');
    const [photo, traversal, missing] = log()[0].toolResults;
    expect(photo.text).toBe('[image]');
    expect(traversal).toMatchObject({ isError: true, text: 'No photo named passwd.' });
    expect(missing).toMatchObject({ isError: true, text: 'No photo named photo-missing.jpg.' });
  });

  it('starts a fresh conversation once when the saved one is gone, and keeps the new one', async () => {
    db.setJson('assistant_session', 'GONE');
    const log = callLog();
    scenario({ rules: [{ when: { resume: true }, do: { resultSubtype: 'error_during_execution', errors: ['No conversation found'] } }], default: { sessionId: 'A-NEW', text: 'hello again' } });
    const reply = await svc.assistantSend('hi');
    expect(reply.text).toBe('hello again');
    expect(log().map((t) => t.resume)).toEqual(['GONE', null]);
    expect(db.getJson('assistant_session')).toBe('A-NEW');
  });

  it('answers one message at a time, and a failure is a system line in the chat, not a dead panel', async () => {
    scenario({ default: { delayMs: 800, text: 'slow' } });
    const a = svc.assistantSend('one');
    await until(() => svc.assistantView().busy, 5000, 'busy');
    await expect(svc.assistantSend('two')).rejects.toMatchObject({ status: 429 });
    expect(() => svc.assistantReset()).toThrow(/Wait for the current answer/);
    await a;
    scenario({ default: { exitCode: 1, stderr: 'boom' } });
    const failed = await svc.assistantSend('three');
    expect(failed.role).toBe('system');
    expect(failed.text).toMatch(/^The assistant did not answer/);
    expect(svc.assistantView().busy).toBe(false);
  });
});
