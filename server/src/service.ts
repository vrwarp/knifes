import { z } from 'zod';
import { AgentError, aiLive, probeAuth, runAgent } from './ai/agent.js';
import { ARCHIVE_ALLOWED_TOOLS, ARCHIVE_SYSTEM_PROMPT, createArchiveServer, mockArchiveReply } from './ai/archive.js';
import { draftHint, type HintStrength } from './ai/copilot.js';
import { SETUP_ALLOWED_TOOLS, SETUP_SYSTEM_PROMPT, createSetupServer, mockSetupReply, type SetupContext } from './ai/setup.js';
import { generateReport } from './ai/report.js';
import { FACILITY_LOG, INCIDENT, LAYER_01, LAYER_01_HEADER, LAYER_02, LAYER_02_HEADER } from './content/ledger.js';
import type { AssistantMessage, ConfigSource, Db, Proposal, ProposalChange } from './db.js';
import { diffPaths, getPath, preview, setPath } from './game/configPaths.js';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import { CREDENTIAL_LABEL, detectCredential, env } from './env.js';
import { haversineMeters } from './game/geo.js';
import { drawWord, generatedPlan, opponentDelayMs, opponentPace, planLength, solverGuess, type OpponentHistoryRow } from './game/opponent.js';
import { advanceTo, applyInvestigationUnlocks, currentSecret, forceStage, freshRound, initialLedger, initialState, isAtLeast, nextStage, normalizeHack, playerView, resetStage, type PlayerView } from './game/state.js';
import { isSolved, normalizeGuess, scoreGuess } from './game/wordle.js';
import { aiOpponentGuess, aiOpponentPlan, opponentLive } from './ai/opponent.js';
import { vocabularyFor } from './content/words.js';
import { STAGE_ORDER, type HackScript, type ArchiveMessage, type EventType, type GameConfig, type GameEvent, type GameState, type HintPush, type StageId } from './types.js';

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
    layer2Label: z.string().min(1).max(80),
    layer2ReleasedText: z.string().max(1000),
    interrogationWindow: z.string().max(80),
  }),
  phil: z.object({ challenge: z.string().max(200), response: z.string().max(200), part1: z.string().max(8000), part2: z.string().max(8000), secondCaller: z.string().min(1).max(60) }),
  archive: z.object({ enabled: z.boolean(), maxMessageChars: z.number().int().min(50).max(2000), welcome: z.string() }),
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
    // The configuration lives in an append-only version table. Older installs kept a single
    // copy in kv; import it once as the first version.
    const latest = db.latestConfig<GameConfig>();
    const legacy = latest ? null : db.getJson<GameConfig>('config');
    this.config = mergeConfig(latest ?? legacy);
    if (!latest) {
      this.config.version = db.appendConfig(this.config, 'system', legacy ? 'Imported the configuration saved before version history' : 'Initial configuration', []);
    } else {
      const added = diffPaths(latest, this.config);
      this.config.version = added.length ? db.appendConfig(this.config, 'system', 'Filled in settings added by an update', added) : latest.version;
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
    void this.prepareScripts();
  }

  /** Stops the opponent timer, for tests and shutdown. */
  close(): void {
    if (this.opponentTimer) clearTimeout(this.opponentTimer);
    this.opponentTimer = null;
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
    // The configuration is saved only through commitConfig, as a new version.
    this.db.setJson('state', this.state);
  }

  /** Persist and push the new state to every connected client. */
  private touch(): void {
    this.syncOpponent();
    this.rev = Math.max(Date.now(), this.rev + 1);
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

  /** Monotonic revision (time-based so it keeps rising across restarts); lets the phone drop stale views. */
  private rev = Date.now();

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
    if (this.state.hack.lockedUntil && this.state.hack.lockedUntil > now) throw new HttpError(423, 'Partition locked');
    if (this.state.hack.lockedUntil && this.state.hack.lockedUntil <= now) this.hackRetry();
    const h = this.state.hack;
    const guess = normalizeGuess(word);
    const secret = currentSecret(this.config, this.state);
    if (guess.length !== secret.length) throw new HttpError(400, `Key must be ${secret.length} characters`);
    h.guesses.push(guess);
    h.guessAt.push(now);
    const scores = scoreGuess(guess, secret);
    const solved = isSolved(scores);
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
    // A race draws a new word (touch() starts the round); solo mode keeps the same secret.
    this.state.hack = this.config.hack.mode === 'race' ? freshRound(h) : { ...h, guesses: [], guessAt: [], lockedUntil: null };
    this.touch();
  }

  // ------------------------------------------------------------ opponent

  private opponentTimer: NodeJS.Timeout | null = null;

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
    if (this.opponentTimer || h.ai.thinking) return;
    const pace = opponentPace(this.config.hack, h.rounds);
    const due = (h.ai.lastAt ?? Date.now()) + opponentDelayMs(pace.intervalSeconds, pace.jitterSeconds);
    const delay = Math.max(500, due - Date.now());
    h.ai.nextAt = Date.now() + delay;
    this.opponentTimer = setTimeout(() => {
      this.opponentTimer = null;
      void this.opponentTurn();
    }, delay);
  }

  private startRound(): void {
    const h = freshRound(this.state.hack);
    const bank = this.config.hack.wordBank;
    if (bank.length && h.used.length >= bank.length && this.config.hack.freePass.enabled && h.rounds > 0) {
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
    const solved = isSolved(scores);
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
    return {
      interrogationWindow: this.config.ledger.interrogationWindow,
      layer1: l.layer1 ? { ...LAYER_01_HEADER, entries: LAYER_01 } : null,
      layer2: l.layer2 ? { ...LAYER_02_HEADER, title: `S30 LEDGER // ${this.config.ledger.layer2Label}`, label: this.config.ledger.layer2Label, incident: INCIDENT, entries: LAYER_02, facilityLog: FACILITY_LOG } : null,
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
    next.hack.secret = next.hack.secret.toUpperCase();
    next.hack.wordBank = [...new Set(next.hack.wordBank.map((w) => w.toUpperCase()))];
    const changes = diffPaths(this.config, next);
    if (!changes.length) return this.config;
    // A new bank or a mode switch mid-puzzle: redraw so the word in play comes from the current bank.
    const bankChanged = JSON.stringify(next.hack.wordBank) !== JSON.stringify(this.config.hack.wordBank) || next.hack.mode !== this.config.hack.mode;
    if (bankChanged && this.state.stage === 'hack' && !this.state.hack.solved) this.state.hack = freshRound(this.state.hack);
    next.version = this.db.appendConfig(next, source, note, changes);
    this.config = next;
    this.event('gm_action', { action: 'config_update', version: next.version, source, note, changes: changes.slice(0, 12) });
    this.touch();
    void this.prepareScripts();
    return this.config;
  }

  // ------------------------------------------------------- prepared scripts

  /** What the prepared scripts depend on; a change here makes them stale. */
  private scriptsKey(): string {
    const c = this.config.hack;
    return JSON.stringify([c.mode, c.aiStyle, [...c.wordBank].sort(), c.aiPlanGuesses, c.aiPlanJitter, c.aiModel, c.aiThinking]);
  }

  private preparing = false;

  /**
   * Writes one script per bank word ahead of the party, so a round never waits on the model.
   * Runs after every configuration change and at boot; words already scripted for these settings
   * are kept, stale ones dropped. Without a live credential the generated scripts are used.
   */
  async prepareScripts(force = false): Promise<void> {
    const c = this.config.hack;
    if (c.mode !== 'race' || c.aiStyle !== 'scripted') return;
    if (this.preparing) return;
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
        if (this.scriptsKey() !== key) break; // settings changed under us; the next pass starts over
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
    }
  }

  /** GM asked for fresh scripts (new ideas, or a credential arrived after the generated ones). */
  regenerateScripts(): void {
    this.event('gm_action', { action: 'regenerate_scripts' });
    void this.prepareScripts(true);
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
    add('info', 'Ledger', `The ${c.ledger.layer2Label} stay hidden until a GM presses Release records in the console. Time it with ${c.phil.secondCaller}'s call.`);
    for (const st of ['geo', 'gate', 'hack', 'investigation'] as StageId[]) {
      if (st === 'geo' && c.geo.mode === 'off') continue;
      if (!(c.hints.quick[st] ?? []).some((h) => h.trim())) add('info', 'Hints', `No quick hints for ${st}.`);
    }
    if (!env.gmPassword || ['change-me', 'test', 'password'].includes(env.gmPassword) || env.gmPassword.length < 8)
      add('warn', 'Security', 'The GM password is short or a default. Set a longer GM_PASSWORD.');
    if (!env.playerKey) add('info', 'Security', 'No PLAYER_KEY: anyone with the link can open the game. Put the key in the QR code to lock it.');
    if (!env.sessionSecret) add('info', 'Security', 'No SESSION_SECRET: GM logins end when the container restarts.');
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

  reset(scope: 'game' | StageId): void {
    if (scope === 'game') {
      const scripts = this.state.hackScripts;
      this.state = { ...initialState(), hackScripts: scripts };
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
    this.state.archive.epoch = (this.state.archive.epoch ?? 0) + 1;
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
