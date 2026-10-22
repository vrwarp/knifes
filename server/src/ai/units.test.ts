import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../defaultConfig.js';
import { initialState } from '../game/state.js';
import type { ArchiveMessage, GameConfig, GameEvent, StageId } from '../types.js';
import { mockHint } from './copilot.js';
import { validatePlan } from './opponent.js';
import { buildReportPrompt, mockReport } from './report.js';
import { caseFilesText, mockSetupReply, setupTools, type SetupContext } from './setup.js';

const cfg = (): GameConfig => structuredClone(DEFAULT_CONFIG);

describe('quick hints in mock mode', () => {
  it('a nudge is the first quick hint, anything stronger the second when there is one', () => {
    const c = cfg();
    const s = initialState();
    s.stage = 'hack';
    expect(mockHint(c, s, 'nudge').hint).toBe(c.hints.quick.hack![0]);
    expect(mockHint(c, s, 'clear').hint).toBe(c.hints.quick.hack![1]);
    expect(mockHint(c, s, 'strong').hint).toBe(c.hints.quick.hack![1]);
    s.stage = 'gate';
    expect(mockHint(c, s, 'strong').hint).toBe(c.hints.quick.gate![0]);
  });
  it('falls back to a line of its own where a stage has none', () => {
    const c = cfg();
    const s = initialState();
    for (const stage of ['intro', 'reveal'] as StageId[]) {
      s.stage = stage;
      expect(mockHint(c, s, 'nudge').hint).toMatch(/re-read what the ARCHIVE/);
    }
    c.hints.quick.geo = [];
    s.stage = 'geo';
    expect(mockHint(c, s, 'clear').hint).toMatch(/re-read what the ARCHIVE/);
  });
});

describe('adversary scripts written by the model', () => {
  it.each([
    [['CRANE', 'SLATE', 'PLANT'], 'PLANT', 3, ['CRANE', 'SLATE', 'PLANT']],
    [['crane', ' slate!', 'plant'], 'PLANT', 3, ['CRANE', 'SLATE', 'PLANT']],
    [['CRANE', 'PLANT'], 'PLANT', 3, ['CRANE', 'PLANT']],
    [['CRANE', 'SLATE', 'STORM', 'PLANT'], 'PLANT', 3, ['CRANE', 'SLATE', 'STORM', 'PLANT']],
  ])('accepts %j for %s in %i (one off either way is fine)', (raw, answer, n, out) => expect(validatePlan(raw, answer, n)).toEqual(out));
  it.each([
    ['not an array', 'PLANT', 3],
    [['PLANT'], 'PLANT', 1],
    [['CRANE', 'SLATE', 'STORM', 'BRICK', 'PLANT'], 'PLANT', 3],
    [['CRANE', 'PLANT', 'SLATE'], 'PLANT', 3],
    [['PLANT', 'CRANE', 'PLANT'], 'PLANT', 3],
    [['CRANE', 'CRANE', 'PLANT'], 'PLANT', 3],
    [['CRANES', 'SLATE', 'PLANT'], 'PLANT', 3],
    [[null, 'SLATE', 'PLANT'], 'PLANT', 3],
    [[], 'PLANT', 2],
  ])('rejects %j for %s in %i', (raw, answer, n) => expect(validatePlan(raw, answer, n)).toBeNull());
});

describe('the case report without a model', () => {
  const ev = (type: string, payload: Record<string, unknown> = {}, id = 1): GameEvent => ({ id, ts: Date.UTC(2026, 9, 25, 3, 0, id), type: type as GameEvent['type'], payload });
  const msg = (role: ArchiveMessage['role'], text: string, id: number): ArchiveMessage => ({ id, ts: Date.UTC(2026, 9, 25, 4, 0, id), role, text });
  it('counts with the right plurals and quotes what he asked', () => {
    const s = initialState();
    s.startedAt = Date.UTC(2026, 9, 25, 2, 0);
    s.gate.attempts = 2;
    s.hack.guesses = ['A'];
    s.hack.rounds = 1;
    s.archive.messageCount = 2;
    s.ledger.layer2 = true;
    const md = mockReport(cfg(), s, [ev('game_start')], [msg('user', 'who was at the office?', 1), msg('assistant', 'records', 2), msg('user', 'and Nina?', 3)]);
    expect(md).toMatch(/^# CASE FILE 30-0214/);
    expect(md).toContain('after 1 key attempt and 1 reset');
    expect(md).toContain('"who was at the office?" and "and Nina?"');
    expect(md).toContain('released by command authority');
    expect(md.trim().endsWith('Filed by ARCHIVE. Integrity restored.')).toBe(true);
  });
  it('says so when the ARCHIVE was never asked and the records never released', () => {
    const md = mockReport(cfg(), initialState(), [], []);
    expect(md).toContain('did not consult the ARCHIVE');
    expect(md).toContain('never released');
    expect(md).toContain('0 key attempts');
  });
  it('hands the model the whole evening: counts, the log and the transcript', () => {
    const s = initialState();
    s.hack.guesses = ['A', 'B'];
    const p = buildReportPrompt(cfg(), s, [ev('hint_pushed', { text: 'x'.repeat(500) }, 7)], [msg('user', 'q'.repeat(600), 1)]);
    expect(p).toContain('Word puzzle guesses: 2');
    expect(p).toContain('hint_pushed');
    expect(p.length).toBeLessThan(2000);
    expect(p).toContain('Surveillance records released: no');
    expect(buildReportPrompt(cfg(), s, [], [])).toContain('(no questions asked)');
  });
});

describe('setup assistant without a model', () => {
  const ctxWith = (overrides: Partial<SetupContext> = {}): SetupContext & { proposals: unknown[] } => {
    const proposals: unknown[] = [];
    return {
      config: () => cfg(),
      readiness: () => [],
      history: () => [],
      propose: (summary, changes) => {
        if (changes.some((c) => c.path === 'gate.nope')) throw new Error('No such setting: gate.nope');
        proposals.push({ summary, changes });
        return { id: proposals.length, ts: 0, summary, changes, status: 'pending', appliedVersion: null, decidedAt: null };
      },
      proposals,
      ...overrides,
    };
  };
  it.each([
    ['set gate.code to "PHIL2026"', 'gate.code', 'PHIL2026'],
    ["set gate.code to 'PHIL2026'", 'gate.code', 'PHIL2026'],
    ['set geo.radiusMeters to 150', 'geo.radiusMeters', 150],
    ['set archive.enabled to false', 'archive.enabled', false],
    ['set hints.quick.gate to ["one", "two"]', 'hints.quick.gate', ['one', 'two']],
    ['set geo.target to {"lat": 34.6, "lng": -118.4}', 'geo.target', { lat: 34.6, lng: -118.4 }],
    ['SET phil.secondCaller TO Matt Smith', 'phil.secondCaller', 'Matt Smith'],
    ['  set gate.prompt to   Call Phil now.  ', 'gate.prompt', 'Call Phil now.'],
  ])('"%s" proposes %s', (message, path, value) => {
    const ctx = ctxWith();
    expect(mockSetupReply(message, ctx)).toMatch(new RegExp(`Proposal #1 sets ${path.replace(/\./g, '\\.')}`));
    expect(ctx.proposals[0]).toEqual({ summary: `Set ${path}`, changes: [{ path, value }] });
  });
  it('explains a bad path, and answers anything else with the readiness list', () => {
    const ctx = ctxWith({ readiness: () => [{ level: 'blocker', area: 'Location puzzle', text: 'No target.' }] });
    expect(mockSetupReply('set gate.nope to 1', ctx)).toMatch(/Could not propose that: No such setting/);
    const reply = mockSetupReply('what is left?', ctx);
    expect(reply).toContain('**blocker** · Location puzzle: No target.');
    expect(mockSetupReply('anything', ctxWith())).toContain('Nothing is missing.');
  });
  type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<{ content: { type: string; text?: string }[]; isError?: boolean }>;
  const run = async (ctx: SetupContext, name: string, args: Record<string, unknown> = {}) => {
    const t = setupTools(ctx).find((x) => x.name === name)!;
    return (t.handler as unknown as Handler)(args, {});
  };
  it('its tools say plainly when there is nothing to show', async () => {
    const ctx = ctxWith();
    expect((await run(ctx, 'readiness_check')).content[0].text).toBe('Nothing missing.');
    expect((await run(ctx, 'list_versions')).content[0].text).toBe('No versions.');
    expect(JSON.parse((await run(ctx, 'get_config')).content[0].text!).gate.code).toBe('S30GHOST');
    const photo = await run(ctx, 'view_photo', { id: 'photo-x.gif' });
    expect(photo.isError).toBe(true);
  });
  it('a refused proposal goes back to the model as an error it can fix', async () => {
    const ctx = ctxWith();
    const bad = await run(ctx, 'propose_changes', { summary: 's', changes: [{ path: 'gate.nope', value: 1 }] });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toMatch(/^Not proposed: No such setting: gate\.nope/);
    const good = await run(ctx, 'propose_changes', { summary: 's', changes: [{ path: 'gate.code', value: 'X1' }] });
    expect(good.content[0].text).toMatch(/Proposal #1 is waiting for a GM/);
  });
  it('the case files hold both layers and the fragments, for the GMs', () => {
    const text = caseFilesText(cfg());
    expect(text).toContain('## PERSONNEL FILES');
    expect(text).toContain('## SURVEILLANCE RECORDS');
    expect(text).toContain('Silver letter opener');
    expect(text).toContain('## Ledger fragments');
  });
});
