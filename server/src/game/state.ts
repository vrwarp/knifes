import { STAGE_ORDER, type GameConfig, type GameState, type HackState, type LetterScore, type StageId } from '../types.js';
import { scoreGuess } from './wordle.js';

export function initialHack(): HackState {
  return {
    guesses: [],
    solved: false,
    lockedUntil: null,
    rounds: 0,
    secret: null,
    used: [],
    round: 0,
    roundResult: null,
    lastWord: null,
    lastRound: null,
    ai: { guesses: [], solved: false, thinking: false, nextAt: null, lastAt: null },
  };
}

/** Saved state from an older build lacks the race fields; fill them in. */
export function normalizeHack(saved: Partial<HackState> | undefined): HackState {
  const base = initialHack();
  return { ...base, ...(saved ?? {}), ai: { ...base.ai, ...(saved?.ai ?? {}) } };
}

/** The word in play: the drawn word in race mode, the configured one in solo mode. */
export function currentSecret(config: GameConfig, state: GameState): string {
  return (config.hack.mode === 'race' && state.hack.secret ? state.hack.secret : config.hack.secret).toUpperCase();
}

/** Race rounds keep the words already drawn; everything else about the puzzle starts over. */
export function freshRound(h: HackState): HackState {
  return { ...initialHack(), used: h.used, rounds: h.rounds, round: h.round, lastWord: h.lastWord, lastRound: h.lastRound };
}

export function initialState(): GameState {
  return {
    stage: 'intro',
    startedAt: null,
    stageTimes: {},
    geo: { attempts: 0, solved: false, lastDistanceM: null },
    gate: { attempts: 0, passed: false },
    hack: initialHack(),
    evidence: { unlocked: { logs: false, audio: false, toxicology: false, manifest: false } },
    archive: { sessionId: null, locked: false, messageCount: 0, busy: false, epoch: 0 },
    deduction: { attempts: 0, passed: false, lastResult: null, lastAnswers: null },
    hints: [],
    report: { markdown: null, generatedAt: null, published: false },
  };
}

export function stageIndex(stage: StageId): number {
  return STAGE_ORDER.indexOf(stage);
}

export function isAtLeast(state: GameState, stage: StageId): boolean {
  return stageIndex(state.stage) >= stageIndex(stage);
}

/** The stage that follows `stage` for this config (geo may be skipped). */
export function nextStage(config: GameConfig, stage: StageId): StageId | null {
  const i = stageIndex(stage);
  if (i < 0 || i >= STAGE_ORDER.length - 1) return null;
  let next = STAGE_ORDER[i + 1];
  if (next === 'geo' && config.geo.mode === 'off') next = 'gate';
  return next;
}

/** Move forward only. Returns true when the stage changed. */
export function advanceTo(state: GameState, stage: StageId, now = Date.now()): boolean {
  if (stageIndex(stage) <= stageIndex(state.stage)) return false;
  state.stage = stage;
  state.stageTimes[stage] = now;
  if (state.startedAt === null) state.startedAt = now;
  return true;
}

/** GM jump: unlock everything up to and including `stage`, marking earlier puzzles solved. */
export function forceStage(config: GameConfig, state: GameState, stage: StageId, now = Date.now()): void {
  const target = stageIndex(stage);
  if (target >= stageIndex('gate')) state.geo.solved = true;
  if (target >= stageIndex('hack')) state.gate.passed = true;
  if (target >= stageIndex('reveal')) state.hack.solved = true;
  if (target >= stageIndex('investigation')) applyInvestigationUnlocks(config, state);
  if (target >= stageIndex('solved')) state.deduction.passed = true;
  state.stage = stage;
  state.stageTimes[stage] = now;
  if (state.startedAt === null) state.startedAt = now;
}

export function applyInvestigationUnlocks(config: GameConfig, state: GameState): void {
  state.evidence.unlocked.logs = true;
  state.evidence.unlocked.manifest = true;
  if (config.evidence.gateMode === 'after_hack') {
    state.evidence.unlocked.audio = true;
    state.evidence.unlocked.toxicology = true;
  }
}

export function resetStage(config: GameConfig, state: GameState, stage: StageId): void {
  switch (stage) {
    case 'geo':
      state.geo = { attempts: 0, solved: false, lastDistanceM: null };
      break;
    case 'gate':
      state.gate = { attempts: 0, passed: false };
      break;
    case 'hack':
      state.hack = initialHack();
      break;
    case 'investigation':
      state.evidence = { unlocked: { logs: false, audio: false, toxicology: false, manifest: false } };
      applyInvestigationUnlocks(config, state);
      state.deduction = { attempts: 0, passed: false, lastResult: null, lastAnswers: null };
      break;
    default:
      break;
  }
  // Rewind the stage pointer to the reset stage when the player is past it.
  if (stageIndex(state.stage) > stageIndex(stage)) {
    state.stage = stage;
    for (const s of STAGE_ORDER) {
      if (stageIndex(s) > stageIndex(stage)) delete state.stageTimes[s];
    }
  }
}

function hackView(config: GameConfig, state: GameState) {
  const h = state.hack;
  const secret = currentSecret(config, state);
  const race = config.hack.mode === 'race';
  const blank = (rows: LetterScore[][]): LetterScore[][] => (config.hack.aiShowLetters ? rows : rows.map((r) => r.map((x) => ({ letter: '', state: x.state }))));
  return {
    mode: config.hack.mode,
    intro: config.hack.intro,
    length: secret.length,
    maxAttempts: config.hack.maxAttempts,
    lockoutSeconds: config.hack.lockoutSeconds,
    guesses: h.guesses,
    rows: h.guesses.map((g) => scoreGuess(g, secret)),
    solved: h.solved,
    lockedUntil: h.lockedUntil,
    rounds: h.rounds,
    round: h.round,
    roundResult: race ? h.roundResult : null,
    // The word is only shown once the round is over and it will never be drawn again.
    lastWord: race && h.roundResult && h.roundResult !== 'player' ? h.lastWord : null,
    lastRound: race ? h.lastRound : null,
    ai: race
      ? {
          rows: blank(h.ai.guesses.map((g) => scoreGuess(g, secret))),
          attempts: h.ai.guesses.length,
          solved: h.ai.solved,
          thinking: h.ai.thinking,
          exhausted: !h.ai.solved && config.hack.maxAttempts !== null && h.ai.guesses.length >= config.hack.maxAttempts,
        }
      : null,
  };
}

/**
 * The Street View panorama the phone embeds, or null when there is no key, no location, or nothing
 * to guess yet. Like the real thing, the panorama's coordinates are visible to anyone who reads the
 * page's network traffic, so they only go out while the puzzle is live and never once it is solved
 * (the reveal text already names the place by then).
 */
export function streetViewForPlayer(config: GameConfig, state: GameState, apiKey: string) {
  const sv = config.geo.streetView;
  const location = sv.location ?? config.geo.target;
  if (!apiKey || !location || config.geo.mode !== 'puzzle' || state.stage !== 'geo' || state.geo.solved) return null;
  return { apiKey, location, heading: sv.heading, pitch: sv.pitch, allowMoving: sv.allowMoving };
}

/** Everything the player's browser may know. No codes, secrets or canonical answers. */
export function playerView(config: GameConfig, state: GameState, googleMapsApiKey = '') {
  return {
    title: config.title,
    stage: state.stage,
    geoMode: config.geo.mode,
    evidenceGateMode: config.evidence.gateMode,
    intro: config.intro,
    geo: {
      briefing: config.geo.briefing,
      mapCenter: config.geo.mapCenter,
      mapZoom: config.geo.mapZoom,
      photos: config.geo.photos,
      streetView: streetViewForPlayer(config, state, googleMapsApiKey),
      revealTitle: config.geo.revealTitle,
      revealBody: config.geo.revealBody,
      attempts: state.geo.attempts,
      solved: state.geo.solved,
      lastDistanceM: state.geo.lastDistanceM,
      targetSet: config.geo.target !== null,
    },
    gate: { prompt: config.gate.prompt, successText: config.gate.successText, attempts: state.gate.attempts, passed: state.gate.passed },
    hack: hackView(config, state),
    reveal: config.reveal,
    evidence: {
      unlocked: state.evidence.unlocked,
      hasAudio: config.evidence.audioUploadId !== null,
      audioNotes: config.evidence.audioNotes,
    },
    archive: {
      enabled: config.archive.enabled,
      locked: state.archive.locked,
      busy: state.archive.busy,
      epoch: state.archive.epoch ?? 0,
      welcome: config.archive.welcome,
      maxMessageChars: config.archive.maxMessageChars,
    },
    deduction: {
      prompt: config.deduction.prompt,
      template: config.deduction.template,
      slots: config.deduction.slots.map((s) => ({ id: s.id, label: s.label, placeholder: s.placeholder })),
      attempts: state.deduction.attempts,
      passed: state.deduction.passed,
      maxAttempts: config.deduction.maxAttempts,
      feedback: config.deduction.feedback,
      lastPass: state.deduction.lastResult?.pass ?? null,
      lastAnswers: state.deduction.lastAnswers,
      successTitle: state.deduction.passed ? config.deduction.successTitle : null,
      successBody: state.deduction.passed ? config.deduction.successBody : null,
      failText: config.deduction.failText,
    },
    hints: state.hints,
    report: state.report.published ? state.report.markdown : null,
  };
}

export type PlayerView = ReturnType<typeof playerView>;
