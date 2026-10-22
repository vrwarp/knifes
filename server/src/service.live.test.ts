import { arg, callLog, scenario, until } from '../test/live.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Db } from './db.js';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import { GameService, HttpError, type ServerMessage } from './service.js';
import type { GameConfig } from './types.js';

// The ARCHIVE, the hint copilot and the case report as they run on the night: live, through the real
// Agent SDK, with the app's own MCP tools answering the stand-in CLI.

let dir: string;
let db: Db;
let svc: GameService | null;
let msgs: ServerMessage[];

/** A service on a fresh database, seeded with `mutate(defaults)`; solo by default so booting writes no adversary scripts. */
function boot(mutate: (c: GameConfig) => void = (c) => (c.hack.mode = 'solo')): GameService {
  const c = structuredClone(DEFAULT_CONFIG);
  mutate(c);
  db.appendConfig(c, 'system', 'test seed', []);
  svc = new GameService(db);
  msgs = [];
  svc.subscribe((m) => msgs.push(m));
  return svc;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 's30-live-'));
  db = new Db(path.join(dir, 't.sqlite'));
  svc = null;
  scenario({ default: { text: 'FAKE ANSWER' } });
});
afterEach(() => {
  svc?.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const SURVEILLANCE_ONLY = ['2:14 AM', 'letter opener', "Director's Office, in", 'Confirmed inside', 'PF-0412', 'HALCYON', 'storage facility'];

describe('ARCHIVE, live', () => {
  it('before the release its tools answer [NO RECORD], and nothing of the night reaches the reply', async () => {
    const s = boot();
    s.setStage('investigation');
    const log = callLog();
    scenario({
      default: {
        tools: [
          { name: 'read_classified', args: { who: 'nina' } },
          { name: 'search_activity', args: { from: '2:00 AM', to: '2:30 AM', text: 'office' } },
          { name: 'search_activity', args: { layer: '2' } },
        ],
        text: '{tool0}\n{tool1}\n{tool2}',
      },
    });
    const { question, reply } = await s.archiveSend('where was Nina at 2:14?');
    expect(question).toMatchObject({ role: 'user', text: 'where was Nina at 2:14?' });
    expect(reply.role).toBe('assistant');
    expect(reply.text).toContain('[NO RECORD]');
    for (const leak of SURVEILLANCE_ONLY) expect(reply.text, leak).not.toContain(leak);
    expect(reply.meta).toMatchObject({ source: 'ai', tools: ['mcp__archive__read_classified', 'mcp__archive__search_activity', 'mcp__archive__search_activity'] });
    const [turn] = log();
    expect(turn.system).toBe(s.config.archive.persona);
    expect(turn.mcpTools.archive.sort()).toEqual(['ledger_lookup', 'read_classified', 'read_personnel', 'search_activity']);
    expect(arg(turn, '--allowedTools')).toBe('mcp__archive__*');
    expect(arg(turn, '--max-turns')).toBe('8');
    expect(arg(turn, '--effort')).toBe('low');
    expect(turn.argv, 'the conversation is kept so the next question can resume it').not.toContain('--no-session-persistence');
    const types = db.recentEvents(50).map((e) => e.type);
    expect(types.filter((t) => t === 'archive_tool')).toHaveLength(3);
    expect(types).toContain('archive_user');
    expect(types).toContain('archive_assistant');
    const status = msgs.filter((m) => m.type === 'archive_status').map((m) => (m as { busy: boolean }).busy);
    expect(status).toEqual([true, false]);
    expect(s.state.archive).toMatchObject({ busy: false, messageCount: 1 });
  });

  it('after the release the same tools read the surveillance records out', async () => {
    const s = boot();
    s.setStage('investigation');
    s.releaseLayer2(true);
    scenario({ default: { tools: [{ name: 'read_classified', args: { who: 'S30-003' } }, { name: 'search_activity', args: { from: '2:10 AM', to: '2:20 AM' } }], text: '{tool0}\n{tool1}' } });
    const { reply } = await s.archiveSend('read Nina’s surveillance record');
    expect(reply.text).toContain('2:14 AM Confirmed inside the office.');
    expect(reply.text).toContain('Silver letter opener');
    expect(reply.text).toContain('Confirmed time of death 2:14 AM');
    expect(reply.text).toMatch(/L2 2:14 AM\s+Nina Calder: Confirmed inside the office\./);
  });

  it('reads the personnel files and the index fragments, and says when nothing matches', async () => {
    const s = boot();
    s.setStage('investigation');
    scenario({
      default: {
        tools: [
          { name: 'read_personnel', args: { who: 'theo' } },
          { name: 'read_personnel', args: { who: 'nobody' } },
          { name: 'ledger_lookup', args: { term: 'syndicate' } },
          { name: 'ledger_lookup', args: { term: 'unicorns' } },
        ],
        text: '{tool0}\n---\n{tool1}\n---\n{tool2}\n---\n{tool3}',
      },
    });
    const { reply } = await s.archiveSend('who is theo');
    const [theo, nobody, syndicate, unicorns] = reply.text.split('\n---\n');
    expect(theo).toContain('S30-004 :: Theo Blackwood :: Field Operative');
    expect(theo).not.toMatch(/\d:\d\d (AM|PM)/);
    expect(nobody).toBe('No agent matches.');
    expect(syndicate).toContain('[SYNDICATE]');
    expect(unicorns).toContain('[SEGMENT LOST]');
  });

  it('resumes the same conversation for the next question', async () => {
    const s = boot();
    s.setStage('investigation');
    const log = callLog();
    scenario({ default: { sessionId: 'S-1', text: 'first' } });
    await s.archiveSend('one');
    expect(s.state.archive.sessionId).toBe('S-1');
    await s.archiveSend('two');
    const turns = log();
    expect(turns.map((t) => t.resume)).toEqual([null, 'S-1']);
  });

  it('starts a fresh conversation once when the saved one cannot be resumed', async () => {
    const s = boot();
    s.setStage('investigation');
    s.state.archive.sessionId = 'GONE';
    const log = callLog();
    scenario({
      rules: [{ when: { resume: true }, do: { resultSubtype: 'error_during_execution', errors: ['No conversation found with session ID: GONE'] } }],
      default: { sessionId: 'S-NEW', text: 'fresh answer' },
    });
    const { reply } = await s.archiveSend('still there?');
    expect(reply).toMatchObject({ role: 'assistant', text: 'fresh answer' });
    expect(s.state.archive.sessionId).toBe('S-NEW');
    expect(log().map((t) => t.resume)).toEqual(['GONE', null]);
    expect(db.recentEvents(20).find((e) => e.type === 'ai_error')?.payload).toMatchObject({ where: 'archive_resume' });
  });

  it('does not retry a question that ran out of turns, and says the link degraded', async () => {
    const s = boot();
    s.setStage('investigation');
    s.state.archive.sessionId = 'S-OLD';
    const log = callLog();
    scenario({ default: { resultSubtype: 'error_max_turns', errors: ['Reached maximum number of turns (8)'] } });
    const { reply } = await s.archiveSend('a hard one');
    expect(reply).toMatchObject({ role: 'system', text: s.config.text.server.archiveDegraded });
    expect(log()).toHaveLength(1);
    expect(db.recentEvents(20).find((e) => e.type === 'ai_error')?.payload).toMatchObject({ where: 'archive' });
    expect(s.state.archive.busy).toBe(false);
  });

  it('an empty answer reads as a lost segment', async () => {
    const s = boot();
    s.setStage('investigation');
    scenario({ default: { text: '' } });
    const { reply } = await s.archiveSend('anything?');
    expect(reply).toMatchObject({ role: 'assistant', text: s.config.text.server.archiveEmptyReply });
  });

  it('a crashed CLI costs one answer, not the ARCHIVE', async () => {
    const s = boot();
    s.setStage('investigation');
    scenario({ default: { exitCode: 1, stderr: 'API Error: 429 rate_limit_error · usage limit reached' } });
    const first = await s.archiveSend('one');
    expect(first.reply).toMatchObject({ role: 'system', text: s.config.text.server.archiveDegraded });
    expect(String(db.recentEvents(20).find((e) => e.type === 'ai_error')?.payload.error)).toMatch(/exited with code 1|429/);
    scenario({ default: { text: 'back again' } });
    const second = await s.archiveSend('two');
    expect(second.reply).toMatchObject({ role: 'assistant', text: 'back again' });
  });

  it('a hung CLI is given up on and the ARCHIVE frees itself', async () => {
    const s = boot();
    s.setStage('investigation');
    scenario({ default: { hang: true } });
    const started = Date.now();
    const { reply } = await s.archiveSend('hello?');
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(reply.role).toBe('system');
    expect(s.state.archive.busy).toBe(false);
  }, 30_000);

  it('answers one question at a time', async () => {
    const s = boot();
    s.setStage('investigation');
    scenario({ default: { delayMs: 1000, text: 'slow answer' } });
    const a = s.archiveSend('first');
    await until(() => s.state.archive.busy, 5000, 'busy');
    await expect(s.archiveSend('second')).rejects.toMatchObject({ status: 429 });
    expect((await a).reply.text).toBe('slow answer');
    scenario({ default: { text: 'third answer' } });
    expect((await s.archiveSend('third')).reply.text).toBe('third answer');
  });

  it('a new session abandons the answer in flight: it never lands in the new transcript or restores the old session', async () => {
    const s = boot();
    s.setStage('investigation');
    scenario({ rules: [{ when: { prompt: 'old question' }, do: { delayMs: 1500, sessionId: 'S-OLD', text: 'old answer' } }], default: { sessionId: 'S-NEW', text: 'new answer' } });
    const old = s.archiveSend('old question').then(
      () => 'resolved',
      (e: unknown) => (e instanceof HttpError ? e.status : String(e)),
    );
    await until(() => s.state.archive.busy, 5000, 'busy');
    s.archiveNewSession();
    expect(s.state.archive.busy, 'a new session frees the ARCHIVE at once').toBe(false);
    const fresh = await s.archiveSend('new question');
    expect(fresh.reply.text).toBe('new answer');
    expect(await old).toBe(409);
    expect(s.archiveTranscript().map((m) => m.text)).toEqual(['new question', 'new answer']);
    expect(s.state.archive.sessionId).toBe('S-NEW');
    expect(s.state.archive.busy).toBe(false);
  });

  it('a game reset abandons the answer in flight too, and starts a new ARCHIVE epoch', async () => {
    const s = boot();
    s.setStage('investigation');
    const epoch = s.state.archive.epoch ?? 0;
    scenario({ default: { delayMs: 1200, sessionId: 'S-DRY', text: 'dry run answer' } });
    const old = s.archiveSend('dry run question').then(
      () => 'resolved',
      (e: unknown) => (e instanceof HttpError ? e.status : String(e)),
    );
    await until(() => s.state.archive.busy, 5000, 'busy');
    s.reset('game');
    expect(await old).toBe(409);
    expect(s.archiveTranscript()).toEqual([]);
    expect(s.state.archive).toMatchObject({ busy: false, sessionId: null, messageCount: 0 });
    expect(s.state.archive.epoch).toBeGreaterThan(epoch);
  });

  it('sealing does not cut off the answer being written, only the next question', async () => {
    const s = boot();
    s.setStage('investigation');
    scenario({ default: { delayMs: 800, text: 'still answered' } });
    const a = s.archiveSend('before the seal');
    await until(() => s.state.archive.busy, 5000, 'busy');
    s.setArchiveLocked(true);
    expect((await a).reply.text).toBe('still answered');
    await expect(s.archiveSend('after the seal')).rejects.toMatchObject({ status: 423 });
  });

  it('refuses when switched off, before the investigation, and for an empty question', async () => {
    const s = boot((c) => {
      c.hack.mode = 'solo';
      c.archive.enabled = false;
    });
    await expect(s.archiveSend('x')).rejects.toMatchObject({ status: 403 });
    s.setStage('investigation');
    await expect(s.archiveSend('x')).rejects.toMatchObject({ status: 403, message: s.config.text.server.archiveOffline });
    const c = structuredClone(s.config);
    c.archive.enabled = true;
    s.updateConfig(c);
    await expect(s.archiveSend('   \n\t ')).rejects.toMatchObject({ status: 400 });
  });

  it('cuts a long question to the configured length and folds whitespace', async () => {
    const s = boot((c) => {
      c.hack.mode = 'solo';
      c.archive.maxMessageChars = 50;
    });
    s.setStage('investigation');
    const log = callLog();
    const { question } = await s.archiveSend(`tell   me\n\nabout ${'x'.repeat(200)}`);
    expect(question.text.length).toBe(50);
    expect(question.text.startsWith('tell me about ')).toBe(true);
    expect(log()[0].prompt).toBe(question.text);
  });
});

describe('hint copilot, live', () => {
  it('drafts a structured hint from the stage, the code and the solution it must protect', async () => {
    const s = boot();
    s.setStage('gate');
    const log = callLog();
    scenario({ default: { text: '', structured: { hint: 'Your code breaker holds the key.', rationale: 'stuck at the gate' } } });
    expect(await s.draftHint('nudge')).toEqual({ hint: 'Your code breaker holds the key.', rationale: 'stuck at the gate', source: 'ai' });
    const [turn] = log();
    expect(turn.prompt).toContain('Current stage: gate');
    expect(turn.prompt).toContain(s.config.gate.code);
    expect(turn.prompt).toContain('Requested strength: nudge');
    expect(turn.system).toMatch(/game masters/);
    expect(JSON.parse(arg(turn, '--json-schema')!)).toMatchObject({ required: ['hint', 'rationale'] });
    expect(turn.argv).toContain('--no-session-persistence');
  });

  it('knows whether the surveillance records are out, so a hint never gives them away early', async () => {
    const s = boot();
    s.setStage('investigation');
    const log = callLog();
    scenario({ default: { text: '', structured: { hint: 'h', rationale: 'r' } } });
    await s.draftHint('clear');
    expect(log()[0].prompt).toMatch(/not yet released and he does not know they exist/);
    s.releaseLayer2(true);
    await s.draftHint('strong');
    expect(log()[1].prompt).toMatch(/SURVEILLANCE RECORDS are released/);
    expect(log()[1].prompt).toContain('Nina Calder');
  });

  it('reads the latest activity of a long evening, not its first events', async () => {
    const s = boot();
    s.setStage('investigation');
    for (let i = 0; i < 120; i++) db.addEvent('archive_user', { text: `question number ${i}` });
    const log = callLog();
    scenario({ default: { text: '', structured: { hint: 'h', rationale: 'r' } } });
    await s.draftHint('nudge');
    const prompt = log()[0].prompt;
    expect(prompt).toContain('question number 119');
    expect(prompt).not.toContain('question number 0"');
  });

  it('a draft without a hint fails cleanly and is logged', async () => {
    const s = boot();
    scenario({ default: { text: 'no structure here' } });
    await expect(s.draftHint('nudge')).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/Copilot failed/) });
    expect(db.recentEvents(10).find((e) => e.type === 'ai_error')?.payload).toMatchObject({ where: 'copilot' });
  });
});

describe('case report, live', () => {
  it('writes the case file from the latest log and the transcript, for the GMs only', async () => {
    const s = boot();
    s.setStage('investigation');
    scenario({ default: { text: 'noted' } });
    await s.archiveSend('who was in the office at 2:14?');
    for (let i = 0; i < 30; i++) db.addEvent('hint_pushed', { text: `hint ${i}` });
    const log = callLog();
    scenario({ default: { text: '# CASE FILE 30-0214\n\nFiled by ARCHIVE. Integrity restored.' } });
    const r = await s.generateReport();
    expect(r).toEqual({ markdown: '# CASE FILE 30-0214\n\nFiled by ARCHIVE. Integrity restored.', source: 'ai' });
    expect(s.state.report.markdown).toBe(r.markdown);
    expect(s.state.report.generatedAt).toBeGreaterThan(0);
    const [turn] = log();
    expect(turn.system).toBe(s.config.report.prompt);
    expect(turn.prompt).toContain('who was in the office at 2:14?');
    expect(turn.prompt).toContain('hint 29');
    expect(JSON.stringify(s.view())).not.toContain('CASE FILE 30-0214');
  });

  it('an empty report fails cleanly and keeps the previous one', async () => {
    const s = boot();
    s.state.report = { markdown: '# earlier', generatedAt: 1 };
    scenario({ default: { text: '' } });
    await expect(s.generateReport()).rejects.toMatchObject({ status: 502 });
    expect(s.state.report.markdown).toBe('# earlier');
  });

  it('a report finished after a game reset is not written into the new game', async () => {
    const s = boot();
    scenario({ default: { delayMs: 800, text: '# old game' } });
    const r = s.generateReport().then(
      () => 'resolved',
      (e: unknown) => (e instanceof HttpError ? e.status : String(e)),
    );
    await new Promise((res) => setTimeout(res, 300));
    s.reset('game');
    expect(await r).toBe(409);
    expect(s.state.report.markdown).toBeNull();
  });
});
