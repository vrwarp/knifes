import { STAGE_ORDER, type GameConfig, type GameState, type StageId } from '../types.js';
import { scoreGuess } from './wordle.js';

export function initialState(): GameState {
  return {
    stage: 'intro',
    startedAt: null,
    stageTimes: {},
    geo: { attempts: 0, solved: false, lastDistanceM: null },
    gate: { attempts: 0, passed: false },
    hack: { guesses: [], solved: false, lockedUntil: null, rounds: 0 },
    evidence: { unlocked: { logs: false, audio: false, toxicology: false, manifest: false } },
    archive: { sessionId: null, locked: false, messageCount: 0, busy: false },
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
      state.hack = { guesses: [], solved: false, lockedUntil: null, rounds: 0 };
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

/** Everything the player's browser may know. No codes, secrets or canonical answers. */
export function playerView(config: GameConfig, state: GameState) {
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
      revealTitle: config.geo.revealTitle,
      revealBody: config.geo.revealBody,
      attempts: state.geo.attempts,
      solved: state.geo.solved,
      lastDistanceM: state.geo.lastDistanceM,
      targetSet: config.geo.target !== null,
    },
    gate: { prompt: config.gate.prompt, successText: config.gate.successText, attempts: state.gate.attempts, passed: state.gate.passed },
    hack: {
      intro: config.hack.intro,
      length: config.hack.secret.length,
      maxAttempts: config.hack.maxAttempts,
      lockoutSeconds: config.hack.lockoutSeconds,
      guesses: state.hack.guesses,
      rows: state.hack.guesses.map((g) => scoreGuess(g, config.hack.secret)),
      solved: state.hack.solved,
      lockedUntil: state.hack.lockedUntil,
      rounds: state.hack.rounds,
    },
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
