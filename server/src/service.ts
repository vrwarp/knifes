import { z } from 'zod';
import { AgentError, aiLive, probeAuth, runAgent } from './ai/agent.js';
import { ARCHIVE_ALLOWED_TOOLS, ARCHIVE_SYSTEM_PROMPT, createArchiveServer, mockArchiveReply } from './ai/archive.js';
import { draftHint, type HintStrength } from './ai/copilot.js';
import { gradeDeduction } from './ai/grader.js';
import { generateReport } from './ai/report.js';
import { ACCESS_LOG, CAMERA_NOTES, MANIFEST, PENDELTON_NOTE, TOXICOLOGY_REPORT } from './content/evidence.js';
import type { Db } from './db.js';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import { CREDENTIAL_LABEL, detectCredential, env } from './env.js';
import { haversineMeters } from './game/geo.js';
import { advanceTo, applyInvestigationUnlocks, forceStage, initialState, isAtLeast, nextStage, playerView, resetStage, type PlayerView } from './game/state.js';
import { isSolved, normalizeGuess, scoreGuess } from './game/wordle.js';
import { SLOT_IDS, STAGE_ORDER, type ArchiveMessage, type EventType, type GameConfig, type GameEvent, type GameState, type HintPush, type SlotId, type StageId } from './types.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export type ServerMessage =
  | { type: 'state'; player: PlayerView; state: GameState; config: GameConfig }
  | { type: 'event'; event: GameEvent }
  | { type: 'hint'; hint: HintPush }
  | { type: 'archive'; message: ArchiveMessage }
  | { type: 'archive_status'; busy: boolean };

type Listener = (m: ServerMessage) => void;

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const slotIds = SLOT_IDS as [SlotId, ...SlotId[]];
const slotSchema = z.object({
  id: z.enum(slotIds),
  label: z.string().min(1),
  placeholder: z.string(),
  canonical: z.string().min(1),
  accept: z.array(z.string()),
  reject: z.array(z.string()),
  guidance: z.string(),
});

export const ConfigSchema = z.object({
  version: z.number(),
  title: z.string().min(1),
  intro: z.object({ headline: z.string(), body: z.string(), buttonLabel: z.string().min(1) }),
  geo: z.object({
    mode: z.enum(['puzzle', 'reveal', 'off']),
    briefing: z.string(),
    target: latLng.nullable(),
    radiusMeters: z.number().min(10).max(50_000),
    mapCenter: latLng,
    mapZoom: z.number().min(1).max(19),
    photos: z.array(z.string()),
    revealTitle: z.string(),
    revealBody: z.string(),
  }),
  gate: z.object({ prompt: z.string(), code: z.string().min(1), successText: z.string() }),
  hack: z.object({
    secret: z.string().regex(/^[A-Za-z]{3,8}$/, 'secret must be 3 to 8 letters'),
    maxAttempts: z.number().int().min(1).max(20),
    lockoutSeconds: z.number().int().min(0).max(3600),
    intro: z.string(),
  }),
  reveal: z.object({ title: z.string(), body: z.string(), buttonLabel: z.string().min(1) }),
  evidence: z.object({
    gateMode: z.enum(['after_hack', 'passcodes']),
    passcodes: z.object({ audio: z.string().min(1), toxicology: z.string().min(1) }),
    audioUploadId: z.string().nullable(),
    audioNotes: z.string(),
  }),
  archive: z.object({ enabled: z.boolean(), maxMessageChars: z.number().int().min(50).max(2000), welcome: z.string() }),
  deduction: z.object({
    prompt: z.string(),
    template: z.string(),
    slots: z.array(slotSchema).length(6),
    successTitle: z.string(),
    successBody: z.string(),
    failText: z.string(),
    maxAttempts: z.number().int().positive().nullable(),
    feedback: z.enum(['pass_fail', 'count']),
  }),
  hints: z.object({ quick: z.record(z.string(), z.array(z.string())) }),
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Saved config over defaults, so fields added in later versions pick up their defaults. */
export function mergeConfig(saved: unknown): GameConfig {
  const merge = (base: unknown, over: unknown): unknown => {
    if (isPlainObject(base) && isPlainObject(over)) {
      const out: Record<string, unknown> = { ...base };
      for (const [k, v] of Object.entries(over)) out[k] = k in base ? merge(base[k], v) : v;
      return out;
    }
    return over === undefined ? base : over;
  };
  const merged = merge(structuredClone(DEFAULT_CONFIG), saved ?? {});
  const parsed = ConfigSchema.safeParse(merged);
  return parsed.success ? (parsed.data as GameConfig) : structuredClone(DEFAULT_CONFIG);
}

const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export class GameService {
  config: GameConfig;
  state: GameState;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly db: Db) {
    this.config = mergeConfig(db.getJson<GameConfig>('config'));
    this.state = { ...initialState(), ...(db.getJson<GameState>('state') ?? {}) };
    this.state.archive.busy = false;
    this.save();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(m: ServerMessage): void {
    for (const fn of this.listeners) {
      try {
        fn(m);
      } catch (err) {
        console.error('listener failed', err);
      }
    }
  }

  private save(): void {
    this.db.setJson('config', this.config);
    this.db.setJson('state', this.state);
  }

  /** Persist and push the new state to every connected client. */
  private touch(): void {
    this.save();
    this.emit(this.snapshotMessage());
  }

  snapshotMessage(): ServerMessage {
    return { type: 'state', player: this.view(), state: this.state, config: this.config };
  }

  event(type: EventType, payload: Record<string, unknown> = {}): GameEvent {
    const e = this.db.addEvent(type, payload);
    this.emit({ type: 'event', event: e });
    return e;
  }

  view(): PlayerView {
    return playerView(this.config, this.state);
  }

  // ---------------------------------------------------------------- player

  start(): void {
    if (this.state.stage !== 'intro') return;
    const next = nextStage(this.config, 'intro');
    if (next && advanceTo(this.state, next)) {
      this.event('game_start');
      this.event('stage', { stage: next });
    }
    this.touch();
  }

  geoGuess(lat: number, lng: number): { solved: boolean; distanceM: number | null } {
    this.requireStage('geo', 'geo');
    if (this.config.geo.mode !== 'puzzle') throw new HttpError(400, 'No geo puzzle is active');
    if (this.state.geo.solved) return { solved: true, distanceM: this.state.geo.lastDistanceM };
    this.state.geo.attempts++;
    let distanceM: number | null = null;
    let solved = false;
    if (this.config.geo.target) {
      distanceM = haversineMeters({ lat, lng }, this.config.geo.target);
      solved = distanceM <= this.config.geo.radiusMeters;
    } else {
      solved = true; // no target configured: never dead-end the player
    }
    this.state.geo.lastDistanceM = distanceM;
    if (solved) this.state.geo.solved = true;
    this.event('geo_guess', { lat, lng, distanceM, solved, attempt: this.state.geo.attempts });
    this.touch();
    return { solved, distanceM };
  }

  geoProceed(): void {
    this.requireStage('geo', 'geo');
    if (this.config.geo.mode === 'puzzle' && !this.state.geo.solved) throw new HttpError(400, 'Location not confirmed yet');
    this.state.geo.solved = true;
    if (advanceTo(this.state, 'gate')) this.event('stage', { stage: 'gate' });
    this.touch();
  }

  gateAttempt(code: string): boolean {
    this.requireStage('gate', 'gate');
    if (this.state.gate.passed) return true;
    this.state.gate.attempts++;
    const ok = normCode(code) === normCode(this.config.gate.code);
    this.event('gate_attempt', { code: code.slice(0, 40), ok, attempt: this.state.gate.attempts });
    if (ok) {
      this.state.gate.passed = true;
      if (advanceTo(this.state, 'hack')) this.event('stage', { stage: 'hack' });
    }
    this.touch();
    return ok;
  }

  hackGuess(word: string): { solved: boolean; lockedUntil: number | null } {
    this.requireStage('hack', 'hack');
    const h = this.state.hack;
    if (h.solved) return { solved: true, lockedUntil: null };
    const now = Date.now();
    if (h.lockedUntil && h.lockedUntil > now) throw new HttpError(423, 'Partition locked');
    if (h.lockedUntil && h.lockedUntil <= now) this.hackRetry();
    const guess = normalizeGuess(word);
    const secret = this.config.hack.secret.toUpperCase();
    if (guess.length !== secret.length) throw new HttpError(400, `Key must be ${secret.length} characters`);
    h.guesses.push(guess);
    const scores = scoreGuess(guess, secret);
    const solved = isSolved(scores);
    this.event('hack_guess', { guess, scores: scores.map((s) => s.state), attempt: h.guesses.length, solved });
    if (solved) {
      h.solved = true;
      h.lockedUntil = null;
      this.event('hack_solved', { attempts: h.guesses.length, rounds: h.rounds });
      if (advanceTo(this.state, 'reveal')) this.event('stage', { stage: 'reveal' });
    } else if (h.guesses.length >= this.config.hack.maxAttempts) {
      h.lockedUntil = now + this.config.hack.lockoutSeconds * 1000;
      h.rounds++;
      this.event('hack_lockout', { rounds: h.rounds, lockedUntil: h.lockedUntil });
    }
    this.touch();
    return { solved, lockedUntil: h.lockedUntil };
  }

  hackRetry(): void {
    this.requireStage('hack', 'hack');
    const h = this.state.hack;
    if (h.solved) return;
    if (h.lockedUntil && h.lockedUntil > Date.now()) throw new HttpError(423, 'Partition still locked');
    h.guesses = [];
    h.lockedUntil = null;
    this.touch();
  }

  revealContinue(): void {
    this.requireStage('reveal', 'reveal');
    if (advanceTo(this.state, 'investigation')) {
      applyInvestigationUnlocks(this.config, this.state);
      this.event('stage', { stage: 'investigation' });
    }
    this.touch();
  }

  evidenceFiles() {
    this.requireStage('investigation', 'evidence vault');
    const u = this.state.evidence.unlocked;
    return {
      gateMode: this.config.evidence.gateMode,
      note: PENDELTON_NOTE,
      logs: u.logs ? { rows: ACCESS_LOG, cameras: CAMERA_NOTES } : null,
      manifest: u.manifest ? MANIFEST : null,
      toxicology: u.toxicology ? TOXICOLOGY_REPORT : null,
      intercept: u.audio ? { notes: this.config.evidence.audioNotes, hasAudio: this.config.evidence.audioUploadId !== null } : null,
      locked: { logs: !u.logs, manifest: !u.manifest, toxicology: !u.toxicology, audio: !u.audio },
    };
  }

  evidenceUnlock(passcode: string): { unlocked: string[] } {
    this.requireStage('investigation', 'evidence vault');
    if (this.config.evidence.gateMode !== 'passcodes') throw new HttpError(400, 'No sealed partitions');
    const given = normCode(passcode);
    const unlocked: string[] = [];
    const u = this.state.evidence.unlocked;
    if (!u.audio && given === normCode(this.config.evidence.passcodes.audio)) {
      u.audio = true;
      unlocked.push('audio');
    }
    if (!u.toxicology && given === normCode(this.config.evidence.passcodes.toxicology)) {
      u.toxicology = true;
      unlocked.push('toxicology');
    }
    this.event('evidence_unlock', { passcode: passcode.slice(0, 40), unlocked });
    this.touch();
    if (!unlocked.length) throw new HttpError(400, 'PASSCODE REJECTED');
    return { unlocked };
  }

  audioPath(): string | null {
    if (!isAtLeast(this.state, 'investigation') || !this.state.evidence.unlocked.audio) return null;
    return this.config.evidence.audioUploadId;
  }

  archiveTranscript(): ArchiveMessage[] {
    return this.db.listArchive();
  }

  async archiveSend(text: string): Promise<ArchiveMessage> {
    this.requireStage('investigation', 'ARCHIVE');
    if (!this.config.archive.enabled) throw new HttpError(403, 'ARCHIVE offline');
    if (this.state.archive.locked) throw new HttpError(423, 'ARCHIVE sealed by command authority');
    if (this.state.archive.busy) throw new HttpError(429, 'ARCHIVE is answering a previous query');
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, this.config.archive.maxMessageChars);
    if (!clean) throw new HttpError(400, 'Empty query');

    const userMsg = this.db.addArchive('user', clean);
    this.emit({ type: 'archive', message: userMsg });
    this.event('archive_user', { text: clean });
    this.state.archive.busy = true;
    this.state.archive.messageCount++;
    this.touch();
    this.emit({ type: 'archive_status', busy: true });
    try {
      let reply: string;
      let meta: Record<string, unknown>;
      if (!aiLive()) {
        reply = mockArchiveReply(clean, { config: this.config, state: this.state });
        meta = { source: 'mock' };
      } else {
        const run = await this.runArchive(clean);
        reply = run.text.trim() || '[SEGMENT LOST] The partition returned nothing. Rephrase the query.';
        meta = { source: 'ai', costUsd: run.costUsd, tools: run.toolCalls.map((t) => t.name) };
      }
      const msg = this.db.addArchive('assistant', reply, meta);
      this.emit({ type: 'archive', message: msg });
      this.event('archive_assistant', { text: reply.slice(0, 500), ...meta });
      return msg;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.event('ai_error', { where: 'archive', error });
      const msg = this.db.addArchive('system', '[LINK DEGRADED] The ARCHIVE did not answer. Repeat the query.', { error });
      this.emit({ type: 'archive', message: msg });
      return msg;
    } finally {
      this.state.archive.busy = false;
      this.touch();
      this.emit({ type: 'archive_status', busy: false });
    }
  }

  private async runArchive(text: string) {
    const attempt = (resume: string | null) =>
      runAgent({
        prompt: text,
        systemPrompt: ARCHIVE_SYSTEM_PROMPT,
        mcpServers: { archive: createArchiveServer(() => ({ config: this.config, state: this.state })) },
        allowedTools: ARCHIVE_ALLOWED_TOOLS,
        resume,
        persist: true,
        maxTurns: 8,
        effort: 'low',
        onToolUse: (call) => this.event('archive_tool', { name: call.name, input: call.input }),
      });
    const sessionId = this.state.archive.sessionId;
    try {
      const run = await attempt(sessionId);
      if (run.sessionId) this.state.archive.sessionId = run.sessionId;
      return run;
    } catch (err) {
      if (!sessionId || (err instanceof AgentError && err.subtype === 'error_max_turns')) throw err;
      // The saved session may be gone (container rebuilt). Start a fresh one once.
      this.event('ai_error', { where: 'archive_resume', error: err instanceof Error ? err.message : String(err) });
      this.state.archive.sessionId = null;
      const run = await attempt(null);
      if (run.sessionId) this.state.archive.sessionId = run.sessionId;
      return run;
    }
  }

  async deductionSubmit(
    raw: Record<string, unknown>,
  ): Promise<{ pass: boolean; title: string | null; body: string | null; failText: string; verified: number | null; total: number }> {
    this.requireStage('investigation', 'deduction grid');
    const d = this.state.deduction;
    const total = this.config.deduction.slots.length;
    if (d.passed) return { pass: true, title: this.config.deduction.successTitle, body: this.config.deduction.successBody, failText: '', verified: total, total };
    if (this.config.deduction.maxAttempts !== null && d.attempts >= this.config.deduction.maxAttempts) {
      throw new HttpError(429, 'No submissions remain');
    }
    const answers = Object.fromEntries(SLOT_IDS.map((id) => [id, String(raw[id] ?? '').trim().slice(0, 300)])) as Record<SlotId, string>;
    d.attempts++;
    const result = await gradeDeduction(this.config.deduction.slots, answers);
    d.lastResult = result;
    d.lastAnswers = answers;
    this.event('deduction_submit', {
      attempt: d.attempts,
      pass: result.pass,
      source: result.source,
      answers,
      slots: result.slots.map((s) => `${s.id}:${s.pass ? 'ok' : 'x'}`).join(' '),
      ...(result.note ? { note: result.note } : {}),
    });
    if (result.pass) {
      d.passed = true;
      if (advanceTo(this.state, 'solved')) this.event('stage', { stage: 'solved' });
    }
    this.touch();
    return {
      pass: result.pass,
      title: result.pass ? this.config.deduction.successTitle : null,
      body: result.pass ? this.config.deduction.successBody : null,
      failText: this.config.deduction.failText,
      verified: this.config.deduction.feedback === 'count' ? result.slots.filter((g) => g.pass).length : null,
      total,
    };
  }

  // -------------------------------------------------------------------- gm

  async overview() {
    const credential = detectCredential();
    return {
      config: this.config,
      state: this.state,
      events: this.db.listEvents(400),
      archive: this.db.listArchive(),
      ai: {
        mode: aiLive() ? 'live' : 'mock',
        model: env.claudeModel,
        credential,
        credentialLabel: CREDENTIAL_LABEL[credential],
        auth: aiLive() ? await probeAuth() : 'needs_login',
      },
      stages: STAGE_ORDER,
    };
  }

  updateConfig(input: unknown): GameConfig {
    const parsed = ConfigSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(400, `Invalid config at ${issue?.path.join('.') || '?'}: ${issue?.message ?? 'unknown'}`);
    }
    const next = parsed.data as GameConfig;
    next.hack.secret = next.hack.secret.toUpperCase();
    next.version = this.config.version + 1;
    this.config = next;
    this.event('gm_action', { action: 'config_update', version: next.version });
    this.touch();
    return this.config;
  }

  setStage(stage: StageId): void {
    if (!STAGE_ORDER.includes(stage)) throw new HttpError(400, 'Unknown stage');
    forceStage(this.config, this.state, stage);
    this.event('gm_action', { action: 'set_stage', stage });
    this.touch();
  }

  reset(scope: 'game' | StageId): void {
    if (scope === 'game') {
      this.state = initialState();
      this.db.clearEvents();
      this.db.clearArchive();
      this.event('gm_action', { action: 'reset_game' });
    } else {
      if (!STAGE_ORDER.includes(scope)) throw new HttpError(400, 'Unknown stage');
      resetStage(this.config, this.state, scope);
      this.event('gm_action', { action: 'reset_stage', stage: scope });
    }
    this.touch();
  }

  pushHint(text: string): HintPush {
    const clean = text.trim();
    if (!clean) throw new HttpError(400, 'Empty hint');
    const hint: HintPush = { id: Date.now(), ts: Date.now(), text: clean };
    this.state.hints.push(hint);
    this.event('hint_pushed', { text: clean });
    this.touch();
    this.emit({ type: 'hint', hint });
    return hint;
  }

  async draftHint(strength: HintStrength) {
    try {
      return await draftHint(this.config, this.state, this.db.listEvents(40), strength);
    } catch (err) {
      this.event('ai_error', { where: 'copilot', error: err instanceof Error ? err.message : String(err) });
      throw new HttpError(502, `Copilot failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  setArchiveLocked(locked: boolean): void {
    this.state.archive.locked = locked;
    this.event('gm_action', { action: locked ? 'archive_lock' : 'archive_unlock' });
    this.touch();
  }

  archiveNewSession(): void {
    this.db.clearArchive();
    this.state.archive.sessionId = null;
    this.state.archive.messageCount = 0;
    this.event('gm_action', { action: 'archive_reset' });
    this.touch();
  }

  async generateReport() {
    try {
      const r = await generateReport(this.config, this.state, this.db.listEvents(1000), this.db.listArchive());
      this.state.report.markdown = r.markdown;
      this.state.report.generatedAt = Date.now();
      this.event('report', { source: r.source, chars: r.markdown.length });
      this.touch();
      return { markdown: r.markdown, source: r.source };
    } catch (err) {
      this.event('ai_error', { where: 'report', error: err instanceof Error ? err.message : String(err) });
      throw new HttpError(502, `Report failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  publishReport(published: boolean): void {
    if (published && !this.state.report.markdown) throw new HttpError(400, 'Generate a report first');
    this.state.report.published = published;
    this.event('gm_action', { action: published ? 'report_publish' : 'report_unpublish' });
    this.touch();
  }

  attachUpload(kind: 'audio' | 'photo', id: string): void {
    if (kind === 'audio') this.config.evidence.audioUploadId = id;
    else if (!this.config.geo.photos.includes(id)) this.config.geo.photos.push(id);
    this.event('gm_action', { action: 'upload', kind, id });
    this.touch();
  }

  detachUpload(id: string): void {
    if (this.config.evidence.audioUploadId === id) this.config.evidence.audioUploadId = null;
    this.config.geo.photos = this.config.geo.photos.filter((p) => p !== id);
    this.event('gm_action', { action: 'upload_remove', id });
    this.touch();
  }

  // ---------------------------------------------------------------- helpers

  private requireStage(stage: StageId, label: string): void {
    if (!isAtLeast(this.state, stage)) throw new HttpError(403, `${label} is not reachable yet`);
  }
}
