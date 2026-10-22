import { z } from 'zod';
import { AgentError, aiLive, probeAuth, runAgent } from './ai/agent.js';
import { ARCHIVE_ALLOWED_TOOLS, createArchiveServer, mockArchiveReply } from './ai/archive.js';
import { draftHint, type HintStrength } from './ai/copilot.js';
import { SETUP_ALLOWED_TOOLS, SETUP_SYSTEM_PROMPT, createSetupServer, mockSetupReply, type SetupContext } from './ai/setup.js';
import { generateReport, mockReport } from './ai/report.js';
import { LEDGER_TITLE, ledgerMinutes, personnelEntries, surveillanceEntries } from './content/ledger.js';
import { fill, type UiText } from './content/text.js';
import type { AssistantMessage, ConfigSource, Db, Proposal, ProposalChange } from './db.js';
import { diffPaths, getPath, preview, setPath } from './game/configPaths.js';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import { CREDENTIAL_LABEL, detectCredential, env, sessionSecret } from './env.js';
import { haversineMeters } from './game/geo.js';
import { drawWord, generatedPlan, opponentDelayMs, opponentPace, planLength, solverGuess, type OpponentHistoryRow } from './game/opponent.js';
import { advanceTo, applyInvestigationUnlocks, currentSecret, forceStage, freshRound, initialLedger, initialState, isAtLeast, nextStage, normalizeHack, playerView, resetStage, type PlayerView } from './game/state.js';
import { isSolved, normalizeGuess, scoreGuess } from './game/wordle.js';
import { aiOpponentGuess, aiOpponentPlan, opponentLive } from './ai/opponent.js';
import { vocabularyFor } from './content/words.js';
import { STAGE_ORDER, type HackScript, type HackState, type ArchiveMessage, type EventType, type GameConfig, type GameEvent, type GameState, type HintPush, type StageId } from './types.js';

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
  | { type: 'archive_status'; busy: boolean }
  | { type: 'assistant'; message: AssistantMessage }
  | { type: 'assistant_status'; busy: boolean }
  | { type: 'assistant_proposal'; proposal: Proposal };

export interface ReadinessItem {
  level: 'blocker' | 'warn' | 'info';
  area: string;
  text: string;
}

type Listener = (m: ServerMessage) => void;

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
/** A surveillance line: the time has to read as a clock time or the ARCHIVE's window search cannot place it. */
const logLine = z.object({
  time: z.string().trim().max(40).refine((t) => ledgerMinutes(t) !== null, 'time must look like 2:14 AM or 2:00–2:30 AM'),
  text: z.string().max(400),
});
const line = z.string().max(400);
/** Every field of the UI text is a short string, or a list of them; the shape is checked against the defaults. */
const textSchema = z.object(
  Object.fromEntries(
    Object.entries(DEFAULT_CONFIG.text).map(([group, fields]) => [
      group,
      z.object(Object.fromEntries(Object.entries(fields as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? z.array(line).min(1).max(20) : line]))),
    ]),
  ),
) as unknown as z.ZodType<UiText>;

const ConfigSchema = z.object({
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
    streetView: z.object({
      location: latLng.nullable(),
      heading: z.number().min(0).max(360),
      pitch: z.number().min(-90).max(90),
      allowMoving: z.boolean(),
    }),
    revealTitle: z.string(),
    revealBody: z.string(),
  }),
  gate: z.object({ prompt: z.string(), code: z.string().min(1), successText: z.string() }),
  hack: z
    .object({
      mode: z.enum(['solo', 'race']),
      secret: z.string().regex(/^[A-Za-z]{3,8}$/, 'secret must be 3 to 8 letters'),
      maxAttempts: z.number().int().min(1).max(50).nullable(),
      lockoutSeconds: z.number().int().min(0).max(3600),
      intro: z.string(),
      wordBank: z.array(z.string().regex(/^[A-Za-z]{3,8}$/, 'bank words must be 3 to 8 letters')).max(10_000),
      aiStyle: z.enum(['scripted', 'live']),
      aiModel: z.string().trim().min(1).max(80),
      aiPlanGuesses: z.number().int().min(2).max(30),
      aiPlanJitter: z.number().int().min(0).max(15),
      aiIntervalSeconds: z.number().min(1).max(600),
      aiJitterSeconds: z.number().min(0).max(600),
      aiSlowdownPerRound: z.number().min(1).max(5),
      aiShowLetters: z.boolean(),
      aiThinking: z.boolean(),
      freePass: z.object({ enabled: z.boolean(), text: z.string().max(400) }),
    })
    .superRefine((h, ctx) => {
      if (h.mode !== 'race') return;
      if (h.wordBank.length < 2) ctx.addIssue({ code: 'custom', path: ['wordBank'], message: 'race mode needs at least two words in the bank' });
      if (h.wordBank.length > 50) ctx.addIssue({ code: 'custom', path: ['wordBank'], message: 'keep the bank to 50 words or fewer; ten is the idea' });
      const lengths = new Set(h.wordBank.map((w) => w.length));
      if (lengths.size > 1) ctx.addIssue({ code: 'custom', path: ['wordBank'], message: 'every word in the bank must have the same length' });
      if (h.aiJitterSeconds >= h.aiIntervalSeconds) ctx.addIssue({ code: 'custom', path: ['aiJitterSeconds'], message: 'jitter must be smaller than the interval' });
      if (h.aiPlanJitter >= h.aiPlanGuesses) ctx.addIssue({ code: 'custom', path: ['aiPlanJitter'], message: 'plan jitter must be smaller than the plan length' });
    }),
  reveal: z.object({ title: z.string(), body: z.string(), buttonLabel: z.string().min(1) }),
  ledger: z.object({
    layer1Label: z.string().min(1).max(80),
    layer2Label: z.string().min(1).max(80),
    layer2ReleasedText: z.string().max(1000),
    interrogationWindow: z.string().max(80),
    headLine: z.string().max(300),
    recordLabel: z.string().min(1).max(80),
    content: z.object({
      personnel: z.object({ subtitle: z.string().max(200), intro: z.string().max(1000) }),
      surveillance: z.object({ subtitle: z.string().max(200), intro: z.string().max(1000) }),
      incident: z.object({ incident: z.string().max(200), timeOfDeath: z.string().max(40), location: z.string().max(200), found: z.string().max(300) }),
      agents: z
        .array(
          z.object({
            id: z.string().trim().min(1).max(20),
            name: z.string().trim().min(1).max(60),
            position: z.string().max(80),
            facts: z.array(z.object({ label: z.string().min(1).max(40), value: z.string().max(400) })).max(12),
            profile: z.string().max(1000),
            log: z.array(logLine).max(60),
            evidence: z.array(z.string().max(200)).max(20),
            findings: z.string().max(2000),
          }),
        )
        .min(1)
        .max(12)
        .superRefine((agents, ctx) => {
          const ids = agents.map((a) => a.id.toLowerCase());
          if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'every agent needs a different Ledger id' });
        }),
      fragments: z.array(z.object({ key: z.string().trim().min(1).max(40), text: z.string().max(1000) })).max(40),
    }),
  }),
  phil: z.object({ challenge: z.string().max(200), response: z.string().max(200), part1: z.string().max(8000), part2: z.string().max(8000), secondCaller: z.string().min(1).max(60) }),
  archive: z.object({ enabled: z.boolean(), maxMessageChars: z.number().int().min(50).max(2000), welcome: z.string(), persona: z.string().min(1).max(12_000), notOnFile: z.string().min(1).max(600) }),
  hints: z.object({ quick: z.record(z.string(), z.array(z.string())) }),
  report: z.object({ prompt: z.string().min(1).max(12_000) }),
  text: textSchema,
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type Key = string | number;
const valueAt = (root: unknown, path: Key[]): unknown => path.reduce<unknown>((cur, k) => (cur !== null && typeof cur === 'object' ? (cur as Record<Key, unknown>)[k] : undefined), root);

/**
 * Puts the defaults back wherever a saved configuration no longer validates (a later build may check
 * more than the one that saved it), keeping every other setting: a value goes back to its default, a
 * list item that cannot be repaired is dropped, and a value already reset climbs to its parent.
 * Returns false when nothing more can be repaired.
 */
function repairConfig(merged: unknown, issues: readonly { path: readonly PropertyKey[] }[], tried: Set<string>, repaired: string[]): boolean {
  let changed = false;
  for (const issue of issues) {
    let path = issue.path.filter((k): k is Key => typeof k === 'string' || typeof k === 'number');
    const item = path.map((k) => typeof k === 'number' || /^\d+$/.test(String(k))).lastIndexOf(true);
    if (item >= 0 && Array.isArray(valueAt(merged, path.slice(0, item)))) {
      const list = valueAt(merged, path.slice(0, item)) as unknown[];
      const index = Number(path[item]);
      if (index < list.length) {
        list.splice(index, 1);
        repaired.push(`${path.slice(0, item + 1).join('.')} (removed)`);
        changed = true;
      }
      continue;
    }
    while (path.length && (tried.has(path.join('.')) || valueAt(DEFAULT_CONFIG, path) === undefined)) path = path.slice(0, -1);
    if (!path.length) return false;
    const parent = valueAt(merged, path.slice(0, -1));
    if (parent === null || typeof parent !== 'object') return false;
    (parent as Record<Key, unknown>)[path[path.length - 1]] = structuredClone(valueAt(DEFAULT_CONFIG, path));
    tried.add(path.join('.'));
    repaired.push(path.join('.'));
    changed = true;
  }
  return changed;
}

/** Saved config over defaults, so fields added in later versions pick up their defaults. `repaired` collects any reset paths. */
export function mergeConfig(saved: unknown, repaired: string[] = []): GameConfig {
  const merge = (base: unknown, over: unknown): unknown => {
    if (isPlainObject(base) && isPlainObject(over)) {
      const out: Record<string, unknown> = { ...base };
      for (const [k, v] of Object.entries(over)) out[k] = k in base ? merge(base[k], v) : v;
      return out;
    }
    return over === undefined ? base : over;
  };
  const merged = merge(structuredClone(DEFAULT_CONFIG), saved ?? {});
  const tried = new Set<string>();
  for (let pass = 0; pass < 50; pass++) {
    const parsed = ConfigSchema.safeParse(merged);
    if (parsed.success) return parsed.data as GameConfig;
    if (!repairConfig(merged, parsed.error.issues, tried, repaired)) break;
  }
  repaired.push('(everything)');
  return structuredClone(DEFAULT_CONFIG);
}

const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** The phone's code keyboard has A to Z and 0 to 9, and takes 16 of them. */
export const GATE_CODE_MAX = 16;
/** Checked when a configuration is saved, not when one is loaded: a stricter rule must never rewrite what the GMs already set. */
function saveProblem(c: GameConfig): string | null {
  const typed = normCode(c.gate.code).length;
  if (typed < 1 || typed > GATE_CODE_MAX) return `Invalid config at gate.code: the phone keyboard types letters and digits only, 1 to ${GATE_CODE_MAX} of them (this code has ${typed})`;
  return null;
}

export class GameService {
  config: GameConfig;
  state: GameState;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly db: Db) {
    // Kept in the database so the phone never sees the revision go backwards across a restart, whatever the clock does.
    this.rev = Math.max(Date.now(), (db.getJson<number>('rev') ?? 0) + 1);
    // The configuration lives in an append-only version table. Older installs kept a single
    // copy in kv; import it once as the first version.
    const latest = db.latestConfig<GameConfig>();
    const legacy = latest ? null : db.getJson<GameConfig>('config');
    const repaired: string[] = [];
    this.config = mergeConfig(latest ?? legacy, repaired);
    if (repaired.length) console.warn(`[section30] saved configuration had settings this build does not accept; back to their defaults: ${repaired.join(', ')}`);
    if (!latest) {
      this.config.version = db.appendConfig(this.config, 'system', legacy ? 'Imported the configuration saved before version history' : 'Initial configuration', []);
    } else {
      const added = diffPaths(latest, this.config);
      const note = repaired.length ? `Reset settings this build does not accept: ${repaired.slice(0, 6).join(', ')}` : 'Filled in settings added by an update';
      this.config.version = added.length ? db.appendConfig(this.config, 'system', note, added) : latest.version;
    }
    this.state = { ...initialState(), ...(db.getJson<GameState>('state') ?? {}) };
    // A save from before the Ledger carries an evidence block instead; the stage it was at decides whether the personnel files are open.
    delete (this.state as unknown as Record<string, unknown>).evidence;
    // The deduction and the solved stage were removed; a save from before lands back in the investigation.
    delete (this.state as unknown as Record<string, unknown>).deduction;
    if (!STAGE_ORDER.includes(this.state.stage)) this.state.stage = 'investigation';
    for (const s of Object.keys(this.state.stageTimes) as StageId[]) if (!STAGE_ORDER.includes(s)) delete this.state.stageTimes[s];
    this.state.report = { markdown: this.state.report?.markdown ?? null, generatedAt: this.state.report?.generatedAt ?? null };
    const { layer1, layer2, layer2ReleasedAt } = { ...initialLedger(), ...(this.state.ledger ?? {}) };
    this.state.ledger = { layer1, layer2, layer2ReleasedAt };
    if (isAtLeast(this.state, 'investigation')) this.state.ledger.layer1 = true;
    this.state.archive.busy = false;
    this.state.hack = normalizeHack(this.state.hack);
    // No request survives a restart; the loop below starts a new one if the race is still on.
    this.state.hack.ai.thinking = false;
    this.state.hack.ai.nextAt = null;
    const savedScripts = (this.state as Partial<GameState>).hackScripts;
    this.state.hackScripts = { key: savedScripts?.key ?? '', byWord: savedScripts?.byWord ?? {}, busy: false };
    this.syncOpponent();
    this.save();
    this.background(this.prepareScripts(), 'hack_scripts');
  }

  /** Stops the opponent timer, for tests and shutdown. An AI call still in flight finishes without writing anything. */
  close(): void {
    this.closed = true;
    if (this.opponentTimer) clearTimeout(this.opponentTimer);
    this.opponentTimer = null;
  }

  private closed = false;

  /** Runs a fire-and-forget task; a failure is logged for the GMs instead of taking the server down. */
  private background(task: Promise<unknown>, where: string): void {
    task.catch((err) => {
      console.error(`[section30] ${where} failed`, err);
      if (!this.closed) this.event('ai_error', { where, error: err instanceof Error ? err.message : String(err) });
    });
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
    if (this.closed) return;
    // The configuration is saved only through commitConfig, as a new version.
    this.db.setJson('state', this.state);
    this.db.setJson('rev', this.rev);
  }

  /** Persist and push the new state to every connected client. */
  private touch(): void {
    if (this.closed) return;
    this.syncOpponent();
    this.rev = Math.max(Date.now(), this.rev + 1);
    this.save();
    this.emit(this.snapshotMessage());
  }

  snapshotMessage(): ServerMessage {
    return { type: 'state', player: this.view(), state: this.state, config: this.config };
  }

  event(type: EventType, payload: Record<string, unknown> = {}): GameEvent {
    if (this.closed) return { id: 0, ts: Date.now(), type, payload };
    const e = this.db.addEvent(type, payload);
    this.emit({ type: 'event', event: e });
    return e;
  }

  /** Monotonic revision (time-based, and stored, so it keeps rising across restarts); lets the phone drop stale views. */
  private rev: number;

  view(): PlayerView & { rev: number } {
    return { ...playerView(this.config, this.state, env.googleMapsApiKey), rev: this.rev };
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
    if (this.state.hack.solved) return { solved: true, lockedUntil: null };
    const now = Date.now();
    if (this.state.hack.lockedUntil && this.state.hack.lockedUntil > now) throw new HttpError(423, this.config.text.server.partitionLocked);
    if (this.state.hack.lockedUntil && this.state.hack.lockedUntil <= now) this.hackRetry();
    const h = this.state.hack;
    const guess = normalizeGuess(word);
    const secret = currentSecret(this.config, this.state);
    if (guess.length !== secret.length) throw new HttpError(400, fill(this.config.text.server.keyLength, { n: secret.length }));
    h.guesses.push(guess);
    h.guessAt.push(now);
    const scores = scoreGuess(guess, secret);
    const solved = isSolved(scores, secret.length);
    this.event('hack_guess', { guess, scores: scores.map((s) => s.state), attempt: h.guesses.length, solved });
    if (solved) {
      h.solved = true;
      h.lockedUntil = null;
      h.roundResult = 'player';
      h.lastWord = secret;
      this.event('hack_solved', { attempts: h.guesses.length, rounds: h.rounds, aiAttempts: h.ai.guesses.length });
      if (advanceTo(this.state, 'reveal')) this.event('stage', { stage: 'reveal' });
    } else if (this.config.hack.maxAttempts !== null && h.guesses.length >= this.config.hack.maxAttempts) {
      this.endRound('exhausted', now);
    }
    this.touch();
    return { solved, lockedUntil: h.lockedUntil };
  }

  hackRetry(): void {
    this.requireStage('hack', 'hack');
    const h = this.state.hack;
    if (h.solved) return;
    if (h.lockedUntil && h.lockedUntil > Date.now()) throw new HttpError(423, 'Partition still locked');
    // A race only ever moves to a new key by winning or losing it; a retry would skip keys towards the free pass.
    if (this.config.hack.mode === 'race' && !h.lockedUntil) return;
    // A race draws a new word (touch() starts the round); solo mode keeps the same secret.
    this.state.hack = this.config.hack.mode === 'race' ? freshRound(h) : { ...h, guesses: [], guessAt: [], lockedUntil: null };
    this.touch();
  }

  // ------------------------------------------------------------ opponent

  private opponentTimer: NodeJS.Timeout | null = null;
  /** The round the pending timer was set for: a round is one hack object, replaced when the next key is drawn. */
  private timerFor: HackState | null = null;

  /** Race mode and a round that is still open: nobody has the key, the partition is not locked, attempts remain. */
  private raceOpen(): boolean {
    const h = this.state.hack;
    return (
      this.config.hack.mode === 'race' &&
      this.state.stage === 'hack' &&
      !h.solved &&
      !h.roundResult &&
      !(h.lockedUntil && h.lockedUntil > Date.now()) &&
      !h.ai.solved &&
      (this.config.hack.maxAttempts === null || h.ai.guesses.length < this.config.hack.maxAttempts)
    );
  }

  /**
   * Keeps the opponent in step with the state. Called from touch(), so every entry into the
   * puzzle (gate passed, GM jump, reset, retry, config change, restart) starts a round and the
   * timer, and every exit stops it.
   */
  private syncOpponent(): void {
    if (this.config.hack.mode === 'race' && this.state.stage === 'hack' && !this.state.hack.solved && !this.state.hack.secret) this.startRound();
    // Read after startRound(): it replaces the hack object.
    const h = this.state.hack;
    if (!this.raceOpen()) {
      if (this.opponentTimer) clearTimeout(this.opponentTimer);
      this.opponentTimer = null;
      if (h.ai.nextAt !== null && !h.ai.thinking) h.ai.nextAt = null;
      return;
    }
    // A timer set in an earlier round (a GM reset, a new bank, a lost round) would play into this one on
    // that round's clock: the first guess on a fresh key could come a second after it appeared.
    if (this.opponentTimer && this.timerFor !== h) {
      clearTimeout(this.opponentTimer);
      this.opponentTimer = null;
    }
    if (this.opponentTimer || h.ai.thinking) return;
    const pace = opponentPace(this.config.hack, h.rounds);
    const due = (h.ai.lastAt ?? Date.now()) + opponentDelayMs(pace.intervalSeconds, pace.jitterSeconds);
    const delay = Math.max(500, due - Date.now());
    h.ai.nextAt = Date.now() + delay;
    this.timerFor = h;
    this.opponentTimer = setTimeout(() => {
      this.opponentTimer = null;
      this.background(this.opponentTurn(), 'opponent');
    }, delay);
  }

  private startRound(): void {
    const h = freshRound(this.state.hack);
    const bank = this.config.hack.wordBank;
    // Keys of this bank not yet drawn; counting words drawn would also count keys from a bank edited since.
    const left = bank.filter((w) => !h.used.includes(w));
    if (bank.length && !left.length && this.config.hack.freePass.enabled && h.rounds > 0) {
      // Every key has been taken by the adversary: the failsafe lets Jimmy through.
      h.freePass = true;
      h.solved = true;
      h.roundResult = 'pass';
      this.state.hack = h;
      this.event('hack_free_pass', { rounds: h.rounds, words: h.used.length, text: this.config.hack.freePass.text });
      if (advanceTo(this.state, 'reveal')) this.event('stage', { stage: 'reveal' });
      return;
    }
    const word = drawWord(bank, h.used);
    if (!word) return; // empty bank: solo secret applies via currentSecret()
    h.secret = word;
    h.used.push(word);
    h.round++;
    h.ai.lastAt = Date.now();
    const prepared = this.state.hackScripts.key === this.scriptsKey() ? this.state.hackScripts.byWord[word] : undefined;
    if (prepared && this.config.hack.aiStyle === 'scripted') {
      h.ai.plan = prepared.plan;
      h.ai.planSource = prepared.source;
    }
    this.state.hack = h;
    const pace = opponentPace(this.config.hack, h.rounds);
    this.event('hack_round', { round: h.round, word, used: h.used.length, bank: this.config.hack.wordBank.length, paceSeconds: pace.intervalSeconds, jitterSeconds: pace.jitterSeconds });
  }

  /**
   * A round lost to the opponent (or, with a cap, to running out of attempts). In race mode the next
   * round starts at once: the word is retired, the banner remembers it, and touch() draws the next one.
   * Solo mode keeps the classic lockout.
   */
  private endRound(result: 'ai' | 'exhausted', now = Date.now()): void {
    const h = this.state.hack;
    const word = currentSecret(this.config, this.state);
    h.roundResult = result;
    h.lastWord = word;
    h.rounds++;
    h.ai.nextAt = null;
    if (this.config.hack.mode === 'race') {
      h.lastRound = { result, word, round: h.round, aiAttempts: h.ai.guesses.length, playerAttempts: h.guesses.length };
      this.event('hack_round_lost', { rounds: h.rounds, reason: result, word, aiAttempts: h.ai.guesses.length, playerAttempts: h.guesses.length });
      this.state.hack = freshRound(h);
      return;
    }
    h.lockedUntil = now + this.config.hack.lockoutSeconds * 1000;
    this.event('hack_lockout', { rounds: h.rounds, lockedUntil: h.lockedUntil, reason: result, word });
  }

  private async opponentTurn(): Promise<void> {
    if (!this.raceOpen()) return;
    const h = this.state.hack;
    const round = h.round;
    const secret = currentSecret(this.config, this.state);
    const history: OpponentHistoryRow[] = h.ai.guesses.map((g) => ({ guess: g, scores: scoreGuess(g, secret).map((x) => x.state) }));
    const vocabulary = vocabularyFor(this.config.hack.wordBank, secret.length);
    const fallback = () => solverGuess(vocabulary, secret.length, history);
    h.ai.thinking = true;
    h.ai.nextAt = null;
    // Pace from when the guess is requested, so model latency (2 to 4 s) does not add to the interval.
    h.ai.lastAt = Date.now();
    this.touch();
    let guess: string | null = null;
    let source: 'ai' | 'solver' | 'script' = 'solver';
    let costUsd: number | null = null;
    if (this.config.hack.aiStyle === 'scripted') {
      // The whole round is written once; later ticks just read the next line.
      if (!h.ai.plan) {
        const n = planLength(this.config.hack.aiPlanGuesses, this.config.hack.aiPlanJitter);
        let plan: string[] | null = null;
        let planSource: 'ai' | 'generated' = 'generated';
        if (opponentLive()) {
          try {
            const r = await aiOpponentPlan({ model: this.config.hack.aiModel, answer: secret, guesses: n, thinking: this.config.hack.aiThinking, timeoutMs: 120_000 });
            plan = r.plan;
            costUsd = r.costUsd;
            planSource = 'ai';
          } catch (err) {
            this.event('ai_error', { where: 'opponent_plan', error: err instanceof Error ? err.message : String(err) });
          }
        }
        plan ??= generatedPlan(vocabulary, secret, n);
        if (h !== this.state.hack || h.round !== round) return;
        // Jimmy can win (in place, same round) while the plan is written: a plan for a finished round is dropped.
        if (!this.raceOpen()) {
          h.ai.thinking = false;
          this.touch();
          return;
        }
        h.ai.plan = plan;
        h.ai.planSource = planSource;
        this.event('hack_ai_plan', { round, guesses: plan.length, asked: n, source: planSource, costUsd, plan });
      }
      guess = h.ai.plan[h.ai.guesses.length] ?? null;
      source = 'script';
    } else if (opponentLive()) {
      try {
        const r = await aiOpponentGuess({
          model: this.config.hack.aiModel,
          length: secret.length,
          history,
          timeoutMs: Math.max(20_000, opponentPace(this.config.hack, h.rounds).intervalSeconds * 4000),
          thinking: this.config.hack.aiThinking,
        });
        guess = r.guess;
        costUsd = r.costUsd;
        source = 'ai';
      } catch (err) {
        this.event('ai_error', { where: 'opponent', error: err instanceof Error ? err.message : String(err) });
      }
    }
    guess ??= fallback();
    // The round may have ended, been reset or re-drawn while the model was thinking.
    if (h !== this.state.hack || h.round !== round) return;
    h.ai.thinking = false;
    if (!guess || !this.raceOpen()) {
      this.touch();
      return;
    }
    h.ai.guesses.push(guess);
    h.ai.guessAt.push(Date.now());
    const scores = scoreGuess(guess, secret);
    const solved = isSolved(scores, secret.length);
    this.event('hack_ai_guess', { guess, scores: scores.map((s) => s.state), attempt: h.ai.guesses.length, solved, source, costUsd });
    if (solved) {
      h.ai.solved = true;
      this.event('hack_ai_solved', { attempts: h.ai.guesses.length, playerAttempts: h.guesses.length, word: secret });
      this.endRound('ai');
    }
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

  /** The Ledger as the phone shows it: the personnel files once the investigation opens, the surveillance records once released (absent before). */
  ledgerFiles() {
    this.requireStage('investigation', 'the Ledger');
    const l = this.state.ledger;
    const c = this.config.ledger.content;
    return {
      interrogationWindow: this.config.ledger.interrogationWindow,
      layer1: l.layer1 ? { ...c.personnel, title: `${LEDGER_TITLE} // ${this.config.ledger.layer1Label}`, entries: personnelEntries(c) } : null,
      layer2: l.layer2
        ? { ...c.surveillance, title: `${LEDGER_TITLE} // ${this.config.ledger.layer2Label}`, label: this.config.ledger.layer2Label, incident: c.incident, entries: surveillanceEntries(c) }
        : null,
      layer2Label: this.config.ledger.layer2Label,
      locked: { layer2: !l.layer2 },
    };
  }

  /** Releases (or, in rehearsal, hides again) the surveillance records. Releasing also pushes the configured transmission to the phone. */
  releaseLayer2(released: boolean): void {
    const l = this.state.ledger;
    if (released === l.layer2) return;
    if (released) {
      if (!isAtLeast(this.state, 'investigation')) throw new HttpError(400, 'The surveillance records can only be released once he is investigating');
      l.layer2 = true;
      l.layer2ReleasedAt = Date.now();
      this.event('ledger_release', { layer: 2 });
      this.touch();
      if (this.config.ledger.layer2ReleasedText.trim()) this.pushHint(this.config.ledger.layer2ReleasedText);
    } else {
      l.layer2 = false;
      l.layer2ReleasedAt = null;
      this.event('gm_action', { action: 'ledger_reseal', layer: 2 });
      this.touch();
    }
  }

  archiveTranscript(): ArchiveMessage[] {
    return this.db.listArchive();
  }

  /** The query the ARCHIVE is answering. A new session or a game reset abandons it: its answer is dropped, and a new query may start. */
  private archiveRun: object | null = null;

  async archiveSend(text: string): Promise<{ question: ArchiveMessage; reply: ArchiveMessage }> {
    this.requireStage('investigation', 'ARCHIVE');
    if (!this.config.archive.enabled) throw new HttpError(403, this.config.text.server.archiveOffline);
    if (this.state.archive.locked) throw new HttpError(423, this.config.text.server.archiveSealed);
    if (this.state.archive.busy || this.archiveRun) throw new HttpError(429, this.config.text.server.archiveBusy);
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, this.config.archive.maxMessageChars);
    if (!clean) throw new HttpError(400, 'Empty query');

    const run = {};
    this.archiveRun = run;
    const question = this.db.addArchive('user', clean);
    this.emit({ type: 'archive', message: question });
    this.event('archive_user', { text: clean });
    this.state.archive.busy = true;
    this.state.archive.messageCount++;
    this.touch();
    this.emit({ type: 'archive_status', busy: true });
    let outcome: { role: 'assistant' | 'system'; text: string; meta: Record<string, unknown> };
    try {
      if (!aiLive()) {
        outcome = { role: 'assistant', text: mockArchiveReply(clean, { config: this.config, state: this.state }), meta: { source: 'mock' } };
      } else {
        const r = await this.runArchive(clean, run);
        outcome = { role: 'assistant', text: r.text.trim() || this.config.text.server.archiveEmptyReply, meta: { source: 'ai', costUsd: r.costUsd, tools: r.toolCalls.map((t) => t.name) } };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.event('ai_error', { where: 'archive', error });
      outcome = this.archiveFallback(clean, error);
    }
    // The GMs started a new session (or reset the game) while this one was answered: it belongs to a conversation that is gone.
    if (this.archiveRun !== run) throw new HttpError(409, 'The ARCHIVE was reset while that query was answered.');
    try {
      const reply = this.db.addArchive(outcome.role, outcome.text, outcome.meta);
      this.emit({ type: 'archive', message: reply });
      if (outcome.role === 'assistant') this.event('archive_assistant', { text: outcome.text.slice(0, 500), ...outcome.meta });
      return { question, reply };
    } finally {
      this.archiveRun = null;
      this.state.archive.busy = false;
      this.touch();
      this.emit({ type: 'archive_status', busy: false });
    }
  }

  /**
   * The model could not answer: an outage, a rate limit, a lapsed login, spent credit. Those last the rest of the
   * night, so the question is answered from the local index (the mock engine, which keeps the same rules about what
   * is on file) instead of a dead end on every question. The GMs still see the AI error.
   */
  private archiveFallback(text: string, error: string): { role: 'assistant' | 'system'; text: string; meta: Record<string, unknown> } {
    try {
      const reply = mockArchiveReply(text, { config: this.config, state: this.state }).trim();
      if (reply) return { role: 'assistant', text: reply, meta: { source: 'fallback', error } };
    } catch (err) {
      console.error('[section30] ARCHIVE fallback failed', err);
    }
    return { role: 'system', text: this.config.text.server.archiveDegraded, meta: { error } };
  }

  private async runArchive(text: string, run: object) {
    const attempt = (resume: string | null) =>
      runAgent({
        prompt: text,
        systemPrompt: this.config.archive.persona,
        mcpServers: { archive: createArchiveServer(() => ({ config: this.config, state: this.state })) },
        allowedTools: ARCHIVE_ALLOWED_TOOLS,
        resume,
        persist: true,
        maxTurns: 8,
        effort: 'low',
        onToolUse: (call) => this.event('archive_tool', { name: call.name, input: call.input }),
      });
    const sessionId = this.state.archive.sessionId;
    // Only the query still in charge may name the session the next one resumes.
    const keep = <R extends { sessionId: string | null }>(r: R): R => {
      if (r.sessionId && this.archiveRun === run) this.state.archive.sessionId = r.sessionId;
      return r;
    };
    try {
      return keep(await attempt(sessionId));
    } catch (err) {
      if (!sessionId || this.archiveRun !== run || (err instanceof AgentError && err.subtype === 'error_max_turns')) throw err;
      // The saved session may be gone (container rebuilt). Start a fresh one once.
      this.event('ai_error', { where: 'archive_resume', error: err instanceof Error ? err.message : String(err) });
      this.state.archive.sessionId = null;
      return keep(await attempt(null));
    }
  }

  // -------------------------------------------------------------------- gm

  async overview() {
    const credential = detectCredential();
    return {
      config: this.config,
      state: this.state,
      events: this.db.recentEvents(400),
      archive: this.db.listArchive(),
      ai: {
        mode: aiLive() ? 'live' : 'mock',
        model: env.claudeModel,
        credential,
        credentialLabel: CREDENTIAL_LABEL[credential],
        auth: aiLive() ? await probeAuth() : 'needs_login',
      },
      streetViewKeySet: env.googleMapsApiKey !== '',
      stages: STAGE_ORDER,
    };
  }

  /**
   * The only way the configuration changes: validate, append a new version, then go live.
   * Old versions are never edited, so any of them can be restored later.
   */
  private commitConfig(input: unknown, source: ConfigSource, note: string): GameConfig {
    const parsed = ConfigSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(400, `Invalid config at ${issue?.path.join('.') || '?'}: ${issue?.message ?? 'unknown'}`);
    }
    const next = parsed.data as GameConfig;
    const problem = saveProblem(next);
    if (problem) throw new HttpError(400, problem);
    next.hack.secret = next.hack.secret.toUpperCase();
    next.hack.wordBank = [...new Set(next.hack.wordBank.map((w) => w.toUpperCase()))];
    const changes = diffPaths(this.config, next);
    if (!changes.length) return this.config;
    // A new bank (in a race) or a mode switch: the word in play has to come from what is configured now. Not
    // only mid-puzzle: a round left open by a jump back would otherwise resume with an old key when he returns.
    const wordsChanged = next.hack.mode !== this.config.hack.mode || (next.hack.mode === 'race' && JSON.stringify(next.hack.wordBank) !== JSON.stringify(this.config.hack.wordBank));
    if (wordsChanged && !this.state.hack.solved) this.state.hack = freshRound(this.state.hack);
    next.version = this.db.appendConfig(next, source, note, changes);
    this.config = next;
    this.event('gm_action', { action: 'config_update', version: next.version, source, note, changes: changes.slice(0, 12) });
    this.touch();
    this.background(this.prepareScripts(), 'hack_scripts');
    return this.config;
  }

  // ------------------------------------------------------- prepared scripts

  /** What the prepared scripts depend on; a change here makes them stale. */
  private scriptsKey(): string {
    const c = this.config.hack;
    return JSON.stringify([c.mode, c.aiStyle, [...c.wordBank].sort(), c.aiPlanGuesses, c.aiPlanJitter, c.aiModel, c.aiThinking]);
  }

  private preparing = false;
  /** A pass was asked for while one was running (true: a forced rewrite); it runs as soon as that one ends. */
  private prepareAgain: boolean | null = null;

  /**
   * Writes one script per bank word ahead of the party, so a round never waits on the model.
   * Runs after every configuration change and at boot; words already scripted for these settings
   * are kept, stale ones dropped. Without a live credential the generated scripts are used.
   */
  async prepareScripts(force = false): Promise<void> {
    const c = this.config.hack;
    if (this.closed || c.mode !== 'race' || c.aiStyle !== 'scripted') return;
    if (this.preparing) {
      this.prepareAgain = (this.prepareAgain ?? false) || force;
      return;
    }
    this.preparing = true;
    try {
      const key = this.scriptsKey();
      const store = this.state.hackScripts;
      if (store.key !== key || force) {
        store.key = key;
        store.byWord = {};
      }
      const missing = c.wordBank.filter((w) => !store.byWord[w]);
      if (!missing.length) return;
      store.busy = true;
      this.touch();
      for (const word of missing) {
        if (this.closed || this.scriptsKey() !== key) break; // settings changed under us; the next pass starts over
        const n = planLength(c.aiPlanGuesses, c.aiPlanJitter);
        let script: HackScript | null = null;
        if (opponentLive()) {
          try {
            const r = await aiOpponentPlan({ model: c.aiModel, answer: word, guesses: n, thinking: c.aiThinking, timeoutMs: 120_000 });
            script = { plan: r.plan, source: 'ai', at: Date.now() };
            this.event('hack_ai_plan', { word, guesses: r.plan.length, asked: n, source: 'ai', costUsd: r.costUsd, plan: r.plan, prepared: true });
          } catch (err) {
            this.event('ai_error', { where: 'opponent_plan', word, error: err instanceof Error ? err.message : String(err) });
          }
        }
        script ??= { plan: generatedPlan(vocabularyFor(c.wordBank, word.length), word, n), source: 'generated', at: Date.now() };
        if (this.scriptsKey() !== key) break;
        this.state.hackScripts.byWord[word] = script;
        this.touch();
      }
      this.event('hack_scripts', { ready: Object.keys(this.state.hackScripts.byWord).length, total: c.wordBank.length, live: opponentLive() });
    } finally {
      this.preparing = false;
      this.state.hackScripts.busy = false;
      this.touch();
      const again = this.prepareAgain;
      this.prepareAgain = null;
      if (again !== null) this.background(this.prepareScripts(again), 'hack_scripts');
    }
  }

  /** GM asked for fresh scripts (new ideas, or a credential arrived after the generated ones). */
  regenerateScripts(): void {
    this.event('gm_action', { action: 'regenerate_scripts' });
    this.background(this.prepareScripts(true), 'hack_scripts');
  }

  updateConfig(input: unknown, note = 'Saved from the config editor'): GameConfig {
    return this.commitConfig(input, 'gm', note);
  }

  configHistory(before?: number) {
    return { current: this.config.version, total: this.db.countConfigVersions(), versions: this.db.listConfigVersions(50, before) };
  }

  /** One version, with what restoring it would change compared with the live configuration. */
  configVersion(version: number) {
    const row = this.db.getConfigVersion<GameConfig>(version);
    if (!row) throw new HttpError(404, `No version ${version}`);
    const old = mergeConfig(row.config);
    const diff = diffPaths(this.config, old).map((p) => ({ path: p, now: preview(getPath(this.config, p)), then: preview(getPath(old, p)) }));
    return { version: row.version, ts: row.ts, source: row.source, note: row.note, changes: row.changes, config: old, diff };
  }

  /** Going backwards appends a copy of the old version, so the restore itself can be undone. */
  restoreConfig(version: number): GameConfig {
    const row = this.db.getConfigVersion<GameConfig>(version);
    if (!row) throw new HttpError(404, `No version ${version}`);
    const before = this.config.version;
    const next = this.commitConfig(mergeConfig(row.config), 'restore', `Restored version ${version}`);
    if (next.version === before) throw new HttpError(409, `The live configuration already matches version ${version}.`);
    return next;
  }

  // ---------------------------------------------------------------- setup assistant

  /** What is still missing or risky before the night. Used by the console and the assistant. */
  readiness(): ReadinessItem[] {
    const c = this.config;
    const items: ReadinessItem[] = [];
    const add = (level: ReadinessItem['level'], area: string, text: string) => items.push({ level, area, text });
    if (env.aiMode === 'mock' || !aiLive()) add('warn', 'AI', 'The AI is in mock mode. Link Claude in the Claude link panel so ARCHIVE, hints, the case report and this assistant use Opus.');
    if (c.geo.mode === 'puzzle' && !c.geo.target) add('blocker', 'Location puzzle', 'No target pin is set, so any pin on the map passes. Set the Lake Elizabeth drop point and a radius.');
    if (c.geo.mode !== 'off' && c.geo.photos.length === 0)
      add(c.geo.mode === 'puzzle' ? 'blocker' : 'warn', 'Location puzzle', 'No field photos are uploaded. Upload two or three photos taken at the drop point.');
    for (const id of c.geo.photos) if (!fs.existsSync(path.join(env.uploadsDir, id))) add('blocker', 'Location puzzle', `Photo ${id} is listed but its file is missing.`);
    if (c.gate.code === DEFAULT_CONFIG.gate.code) add('info', 'Code gate', `The code is still the default ${c.gate.code}. Fine if that is what Phil will read out.`);
    const typed = normCode(c.gate.code).length;
    if (typed < 1 || typed > GATE_CODE_MAX) add('blocker', 'Code gate', `The code ${c.gate.code} has ${typed} letters and digits; the phone keyboard takes 1 to ${GATE_CODE_MAX}. Jimmy cannot type it in full.`);
    add('info', 'Ledger', `The ${c.ledger.layer2Label} stay hidden until a GM presses Release records in the console. Time it with ${c.phil.secondCaller}'s call.`);
    for (const st of ['geo', 'gate', 'hack', 'investigation'] as StageId[]) {
      if (st === 'geo' && c.geo.mode === 'off') continue;
      if (!(c.hints.quick[st] ?? []).some((h) => h.trim())) add('info', 'Hints', `No quick hints for ${st}.`);
    }
    if (!env.gmPassword || ['change-me', 'test', 'password'].includes(env.gmPassword) || env.gmPassword.length < 8)
      add('warn', 'Security', 'The GM password is short or a default. Set a longer GM_PASSWORD.');
    if (!env.playerKey) add('info', 'Security', 'No PLAYER_KEY: anyone with the link can open the game. Put the key in the QR code to lock it.');
    if (sessionSecret().source === 'memory') add('warn', 'Security', 'The login key could not be kept in the data directory, so GM logins and the player link end when the container restarts. Set SESSION_SECRET.');
    if (!env.cookieSecure) add('info', 'Security', 'COOKIE_SECURE is off. Set it to 1 when the site is served over HTTPS.');
    const order = { blocker: 0, warn: 1, info: 2 };
    return items.sort((a, b) => order[a.level] - order[b.level]);
  }

  /** Validate a proposed set of edits against the live configuration without applying it. */
  checkChanges(changes: ProposalChange[]): GameConfig {
    if (!changes.length) throw new HttpError(400, 'A proposal needs at least one change.');
    let next: GameConfig = this.config;
    for (const ch of changes) {
      try {
        next = setPath(next, ch.path, ch.value);
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : String(e));
      }
    }
    const parsed = ConfigSchema.safeParse(next);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(400, `Invalid value at ${issue?.path.join('.') || '?'}: ${issue?.message ?? 'unknown'}`);
    }
    const problem = saveProblem(parsed.data as GameConfig);
    if (problem) throw new HttpError(400, problem);
    return parsed.data as GameConfig;
  }

  propose(summary: string, changes: ProposalChange[]): Proposal {
    this.checkChanges(changes);
    const p = this.db.addProposal(summary.trim().slice(0, 300) || 'Suggested changes', changes);
    this.emit({ type: 'assistant_proposal', proposal: p });
    return p;
  }

  proposals() {
    return this.db.listProposals(30).map((p) => ({
      ...p,
      preview: p.changes.map((c) => ({ path: c.path, now: preview(getPath(this.config, c.path)), next: preview(c.value) })),
    }));
  }

  applyProposal(id: number): GameConfig {
    const p = this.db.getProposal(id);
    if (!p) throw new HttpError(404, 'No such proposal');
    if (p.status !== 'pending') throw new HttpError(409, `That proposal was already ${p.status}.`);
    const next = this.checkChanges(p.changes);
    const before = this.config.version;
    const cfg = this.commitConfig(next, 'assistant', `Assistant: ${p.summary}`);
    this.db.decideProposal(id, 'applied', cfg.version === before ? null : cfg.version);
    const updated = this.db.getProposal(id);
    if (updated) this.emit({ type: 'assistant_proposal', proposal: updated });
    return cfg;
  }

  private assistantBusy = false;

  private setupContext(): SetupContext {
    return {
      config: () => this.config,
      readiness: () => this.readiness(),
      history: () => this.db.listConfigVersions(20),
      propose: (summary, changes) => this.propose(summary, changes),
    };
  }

  assistantView() {
    return { messages: this.db.listAssistantMessages(), proposals: this.proposals(), readiness: this.readiness(), busy: this.assistantBusy, live: aiLive() };
  }

  async assistantSend(text: string): Promise<AssistantMessage> {
    const clean = text.trim().slice(0, 4000);
    if (!clean) throw new HttpError(400, 'Empty message');
    if (this.assistantBusy) throw new HttpError(429, 'The assistant is still answering the previous message.');
    const user = this.db.addAssistantMessage('user', clean);
    this.emit({ type: 'assistant', message: user });
    this.assistantBusy = true;
    this.emit({ type: 'assistant_status', busy: true });
    try {
      let reply: string;
      let meta: Record<string, unknown>;
      if (!aiLive()) {
        reply = mockSetupReply(clean, this.setupContext());
        meta = { source: 'mock' };
      } else {
        const run = await this.runSetup(clean);
        reply = run.text.trim() || 'No answer came back. Try asking again.';
        meta = { source: 'ai', costUsd: run.costUsd, tools: run.toolCalls.map((t) => t.name) };
      }
      const msg = this.db.addAssistantMessage('assistant', reply, meta);
      this.emit({ type: 'assistant', message: msg });
      return msg;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.event('ai_error', { where: 'assistant', error });
      const msg = this.db.addAssistantMessage('system', `The assistant did not answer: ${error.slice(0, 300)}`);
      this.emit({ type: 'assistant', message: msg });
      return msg;
    } finally {
      this.assistantBusy = false;
      this.emit({ type: 'assistant_status', busy: false });
    }
  }

  /** Clears the chat only. Proposals and configuration versions are kept. */
  assistantReset(): void {
    if (this.assistantBusy) throw new HttpError(429, 'Wait for the current answer first.');
    this.db.clearAssistantMessages();
    this.db.setJson('assistant_session', null);
  }

  private async runSetup(text: string) {
    const attempt = (resume: string | null) =>
      runAgent({
        prompt: text,
        systemPrompt: SETUP_SYSTEM_PROMPT,
        mcpServers: { setup: createSetupServer(this.setupContext()) },
        allowedTools: SETUP_ALLOWED_TOOLS,
        resume,
        persist: true,
        maxTurns: 16,
        effort: 'high',
        timeoutMs: Math.max(env.aiTimeoutMs, 240_000),
      });
    const sessionId = this.db.getJson<string>('assistant_session');
    try {
      const run = await attempt(sessionId);
      if (run.sessionId) this.db.setJson('assistant_session', run.sessionId);
      return run;
    } catch (err) {
      if (!sessionId || (err instanceof AgentError && err.subtype === 'error_max_turns')) throw err;
      this.db.setJson('assistant_session', null);
      const run = await attempt(null);
      if (run.sessionId) this.db.setJson('assistant_session', run.sessionId);
      return run;
    }
  }

  dismissProposal(id: number): void {
    const p = this.db.getProposal(id);
    if (!p) throw new HttpError(404, 'No such proposal');
    if (p.status !== 'pending') return;
    this.db.decideProposal(id, 'dismissed', null);
    const updated = this.db.getProposal(id);
    if (updated) this.emit({ type: 'assistant_proposal', proposal: updated });
  }

  setStage(stage: StageId): void {
    if (!STAGE_ORDER.includes(stage)) throw new HttpError(400, 'Unknown stage');
    forceStage(this.config, this.state, stage);
    this.event('gm_action', { action: 'set_stage', stage });
    this.touch();
  }

  /** Bumped by a whole-game reset, so a slow AI answer for the old game never lands in the new one. */
  private game = 0;

  reset(scope: 'game' | StageId): void {
    if (scope === 'game') {
      const scripts = this.state.hackScripts;
      // A new epoch, not 0 again: a phone still open from the dry run drops the old ARCHIVE lines it holds.
      const epoch = (this.state.archive.epoch ?? 0) + 1;
      this.state = { ...initialState(), hackScripts: scripts };
      this.state.archive.epoch = epoch;
      this.archiveRun = null;
      this.game++;
      this.db.clearEvents();
      this.db.clearArchive();
      this.event('gm_action', { action: 'reset_game' });
      this.emit({ type: 'archive_status', busy: false });
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
    // Ids only ever rise, even two in one millisecond or with the clock stepped back: the phone shows the ones above the last it saw.
    const now = Date.now();
    const last = this.state.hints.reduce((m, h) => Math.max(m, h.id), 0);
    const hint: HintPush = { id: Math.max(now, last + 1), ts: now, text: clean };
    this.state.hints.push(hint);
    this.event('hint_pushed', { text: clean });
    this.touch();
    this.emit({ type: 'hint', hint });
    return hint;
  }

  async draftHint(strength: HintStrength) {
    try {
      return await draftHint(this.config, this.state, this.db.recentEvents(40), strength);
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

  /** A fresh conversation. A query still being answered is abandoned, so this also frees an ARCHIVE stuck on a slow answer. */
  archiveNewSession(): void {
    this.db.clearArchive();
    this.archiveRun = null;
    this.state.archive.busy = false;
    this.state.archive.sessionId = null;
    this.state.archive.messageCount = 0;
    this.state.archive.epoch = (this.state.archive.epoch ?? 0) + 1;
    this.event('gm_action', { action: 'archive_reset' });
    this.touch();
    this.emit({ type: 'archive_status', busy: false });
  }

  async generateReport() {
    const game = this.game;
    try {
      const r = await generateReport(this.config, this.state, this.db.recentEvents(1000), this.db.listArchive());
      if (game !== this.game) throw new HttpError(409, 'The game was reset while the report was being written.');
      this.state.report.markdown = r.markdown;
      this.state.report.generatedAt = Date.now();
      this.event('report', { source: r.source, chars: r.markdown.length });
      this.touch();
      return { markdown: r.markdown, source: r.source };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const error = err instanceof Error ? err.message : String(err);
      this.event('ai_error', { where: 'report', error });
      // With no report yet, the template is something to print for the table; one the GMs already have is never replaced by it.
      if (this.state.report.markdown || game !== this.game) throw new HttpError(502, `Report failed: ${error}`);
      const markdown = mockReport(this.config, this.state, this.db.recentEvents(1000), this.db.listArchive());
      this.state.report.markdown = markdown;
      this.state.report.generatedAt = Date.now();
      this.event('report', { source: 'fallback', chars: markdown.length });
      this.touch();
      return { markdown, source: 'fallback' as const, error };
    }
  }

  attachUpload(kind: 'photo', id: string): void {
    const next = structuredClone(this.config);
    if (!next.geo.photos.includes(id)) next.geo.photos.push(id);
    this.event('gm_action', { action: 'upload', kind, id });
    this.commitConfig(next, 'upload', 'Added a field photo');
  }

  /** Takes the file out of the live configuration. The file itself is kept so older versions still restore. */
  detachUpload(id: string): void {
    const next = structuredClone(this.config);
    next.geo.photos = next.geo.photos.filter((p) => p !== id);
    this.event('gm_action', { action: 'upload_remove', id });
    this.commitConfig(next, 'upload', 'Removed an upload');
  }

  // ---------------------------------------------------------------- helpers

  private requireStage(stage: StageId, label: string): void {
    if (!isAtLeast(this.state, stage)) throw new HttpError(403, `${label} is not reachable yet`);
  }
}
