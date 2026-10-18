export type GeoMode = 'puzzle' | 'reveal' | 'off';
export type EvidenceGateMode = 'after_hack' | 'passcodes';
export type HackMode = 'solo' | 'race';
export type StageId = 'intro' | 'geo' | 'gate' | 'hack' | 'reveal' | 'investigation' | 'solved';
export const STAGE_ORDER: StageId[] = ['intro', 'geo', 'gate', 'hack', 'reveal', 'investigation', 'solved'];

export type SlotId = 'time' | 'suspect' | 'method' | 'asset' | 'motive' | 'prop';
export const SLOT_IDS: SlotId[] = ['time', 'suspect', 'method', 'asset', 'motive', 'prop'];

export interface SlotSpec {
  id: SlotId;
  label: string;
  placeholder: string;
  canonical: string;
  accept: string[];
  reject: string[];
  guidance: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GameConfig {
  version: number;
  title: string;
  intro: { headline: string; body: string; buttonLabel: string };
  geo: {
    mode: GeoMode;
    briefing: string;
    target: LatLng | null;
    radiusMeters: number;
    mapCenter: LatLng;
    mapZoom: number;
    photos: string[];
    /** Street View panorama the player looks around in. `location` null means the target itself. */
    streetView: { location: LatLng | null; heading: number; pitch: number; allowMoving: boolean };
    revealTitle: string;
    revealBody: string;
  };
  gate: { prompt: string; code: string; successText: string };
  hack: {
    /** Solo: the fixed secret below. Race: a fresh word from the bank each round, against an AI opponent. */
    mode: HackMode;
    secret: string;
    /** Attempts per round for each side; null means unlimited, so a race ends only when someone finds the word. */
    maxAttempts: number | null;
    lockoutSeconds: number;
    intro: string;
    wordBank: string[];
    /** Scripted: one model call per round writes the whole guess list. Live: one call per guess. */
    aiStyle: 'scripted' | 'live';
    aiModel: string;
    /** Scripted: how many guesses the script should take to reach the key, ± jitter. */
    aiPlanGuesses: number;
    aiPlanJitter: number;
    /** Mean seconds between opponent guesses, and the uniform jitter around it. */
    aiIntervalSeconds: number;
    aiJitterSeconds: number;
    /** Interval and jitter are multiplied by this after every round the opponent wins (1 = constant pace). */
    aiSlowdownPerRound: number;
    /** Whether the phone shows the opponent's letters or only its colour feedback. */
    aiShowLetters: boolean;
    /** Extended thinking for the opponent. Off keeps it quick and beatable. */
    aiThinking: boolean;
    /** When the adversary has taken every word in the bank, let Jimmy through with this in-world reason. */
    freePass: { enabled: boolean; text: string };
  };
  reveal: { title: string; body: string; buttonLabel: string };
  evidence: {
    gateMode: EvidenceGateMode;
    passcodes: { audio: string; toxicology: string };
    audioUploadId: string | null;
    audioNotes: string;
  };
  archive: { enabled: boolean; maxMessageChars: number; welcome: string };
  deduction: {
    prompt: string;
    template: string;
    slots: SlotSpec[];
    successTitle: string;
    successBody: string;
    failText: string;
    maxAttempts: number | null;
    feedback: 'pass_fail' | 'count';
  };
  hints: { quick: Partial<Record<StageId, string[]>> };
}

export interface SlotGrade {
  id: SlotId;
  pass: boolean;
  reason: string;
}

export interface GradeResult {
  pass: boolean;
  slots: SlotGrade[];
  source: 'ai' | 'fallback';
  note?: string;
}

export interface HintPush {
  id: number;
  ts: number;
  text: string;
}

export type HackRoundResult = 'player' | 'ai' | 'exhausted' | 'pass';

export interface HackState {
  guesses: string[];
  /** When each of Jimmy's guesses landed, for the interleaved transcript on the phone. */
  guessAt: number[];
  solved: boolean;
  lockedUntil: number | null;
  /** Completed rounds (opponent wins, and lockouts when attempts are capped). */
  rounds: number;
  /** Race mode: the word in play this round. Null until a round starts, and always null in solo mode. */
  secret: string | null;
  /** Race mode: words already drawn this game, so no round repeats one. */
  used: string[];
  /** Bumped whenever a new word is drawn; lets a slow opponent reply be dropped when the round moved on. */
  round: number;
  /** How the current round ended, if it has. Cleared when the next round starts. */
  roundResult: HackRoundResult | null;
  /** The word of the last finished round, shown to the player once it is retired. */
  lastWord: string | null;
  /** Set when the bank ran out and the free pass let Jimmy through. */
  freePass: boolean;
  /** Race mode: how the previous round ended, kept through the next round for the banner on the phone. */
  lastRound: { result: HackRoundResult; word: string; round: number; aiAttempts: number; playerAttempts: number } | null;
  ai: {
    guesses: string[];
    guessAt: number[];
    solved: boolean;
    /** A guess request is in flight. */
    thinking: boolean;
    /** Scripted style: the guesses this round will play, written once the round starts. */
    plan: string[] | null;
    planSource: 'ai' | 'generated' | null;
    /** When the next opponent guess is due, for the countdown on the phone. */
    nextAt: number | null;
    /** When the opponent last guessed (or the round began); paces the next guess. */
    lastAt: number | null;
  };
}

/** One prepared adversary script for a bank word, written ahead of the party. */
export interface HackScript {
  plan: string[];
  source: 'ai' | 'generated';
  at: number;
}

/** Scripts prepared for the current bank and plan settings; `key` says which settings they were written for. */
export interface HackScripts {
  key: string;
  byWord: Record<string, HackScript>;
  /** A preparation pass is running. */
  busy: boolean;
}

export interface GameState {
  stage: StageId;
  startedAt: number | null;
  stageTimes: Partial<Record<StageId, number>>;
  geo: { attempts: number; solved: boolean; lastDistanceM: number | null };
  gate: { attempts: number; passed: boolean };
  hack: HackState;
  /** Survives a game reset: it belongs to the configuration, not the evening. */
  hackScripts: HackScripts;
  evidence: { unlocked: { logs: boolean; audio: boolean; toxicology: boolean; manifest: boolean } };
  archive: { sessionId: string | null; locked: boolean; messageCount: number; busy: boolean; /** Bumped when the GM starts a new ARCHIVE session. */ epoch?: number };
  deduction: { attempts: number; passed: boolean; lastResult: GradeResult | null; lastAnswers: Record<SlotId, string> | null };
  hints: HintPush[];
  report: { markdown: string | null; generatedAt: number | null; published: boolean };
}

export type EventType =
  | 'game_start'
  | 'stage'
  | 'geo_guess'
  | 'gate_attempt'
  | 'hack_guess'
  | 'hack_lockout'
  | 'hack_solved'
  | 'hack_round'
  | 'hack_round_lost'
  | 'hack_ai_plan'
  | 'hack_free_pass'
  | 'hack_scripts'
  | 'hack_ai_guess'
  | 'hack_ai_solved'
  | 'evidence_unlock'
  | 'archive_user'
  | 'archive_assistant'
  | 'archive_tool'
  | 'deduction_submit'
  | 'hint_pushed'
  | 'gm_action'
  | 'ai_error'
  | 'report';

export interface GameEvent {
  id: number;
  ts: number;
  type: EventType;
  payload: Record<string, unknown>;
}

export interface ArchiveMessage {
  id: number;
  ts: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: Record<string, unknown>;
}

export type LetterState = 'hit' | 'near' | 'miss';
export interface LetterScore {
  letter: string;
  state: LetterState;
}
