export type StageId = 'intro' | 'geo' | 'gate' | 'hack' | 'reveal' | 'investigation' | 'solved';
export const STAGE_ORDER: StageId[] = ['intro', 'geo', 'gate', 'hack', 'reveal', 'investigation', 'solved'];
export type SlotId = 'time' | 'suspect' | 'method' | 'asset' | 'motive' | 'prop';
export type LetterState = 'hit' | 'near' | 'miss';
export type HackMode = 'solo' | 'race';
export type HackRoundResult = 'player' | 'ai' | 'exhausted' | 'pass';
export interface LetterScore {
  letter: string;
  state: LetterState;
}
export interface LatLng {
  lat: number;
  lng: number;
}
export interface HintPush {
  id: number;
  ts: number;
  text: string;
}

export interface PlayerView {
  /** Server revision; a view older than one already shown is ignored. */
  rev: number;
  title: string;
  stage: StageId;
  geoMode: 'puzzle' | 'reveal' | 'off';
  intro: { headline: string; body: string; buttonLabel: string };
  geo: {
    briefing: string;
    mapCenter: LatLng;
    mapZoom: number;
    photos: string[];
    /** Null when no Maps key is configured, no location is set, or the puzzle is over. */
    streetView: { apiKey: string; location: LatLng; heading: number; pitch: number; allowMoving: boolean } | null;
    revealTitle: string;
    revealBody: string;
    attempts: number;
    solved: boolean;
    lastDistanceM: number | null;
    targetSet: boolean;
  };
  gate: { prompt: string; successText: string; attempts: number; passed: boolean };
  hack: {
    mode: HackMode;
    intro: string;
    length: number;
    maxAttempts: number | null;
    lockoutSeconds: number;
    guesses: string[];
    rows: LetterScore[][];
    guessAt: number[];
    solved: boolean;
    lockedUntil: number | null;
    rounds: number;
    round: number;
    roundResult: HackRoundResult | null;
    lastWord: string | null;
    lastRound: { result: HackRoundResult; word: string; round: number; aiAttempts: number; playerAttempts: number } | null;
    /** The failsafe text when the bank ran out and Jimmy was let through. */
    freePass: string | null;
    wordsLeft: number | null;
    ai: {
      /** Letters are blank unless the GM chose to show them. */
      rows: LetterScore[][];
      guessAt: number[];
      attempts: number;
      solved: boolean;
      thinking: boolean;
      exhausted: boolean;
    } | null;
  };
  reveal: { title: string; body: string; buttonLabel: string };
  ledger: { layer1: boolean; layer2: boolean; layer2Label: string; interrogationWindow: string };
  archive: { enabled: boolean; locked: boolean; busy: boolean; welcome: string; maxMessageChars: number; epoch: number };
  deduction: {
    prompt: string;
    template: string;
    slots: { id: SlotId; label: string; placeholder: string }[];
    attempts: number;
    passed: boolean;
    maxAttempts: number | null;
    feedback: 'pass_fail' | 'count';
    lastPass: boolean | null;
    lastAnswers: Record<SlotId, string> | null;
    successTitle: string | null;
    successBody: string | null;
    failText: string;
  };
  hints: HintPush[];
  report: string | null;
}

export interface LedgerEntry {
  id: string;
  name: string;
  position: string;
  /** Personnel file: the profile. Surveillance record: the additional findings. */
  notes: string;
  facts?: { label: string; value: string }[];
  log?: { time: string; text: string }[];
  /** Surveillance record only. */
  evidence?: string[];
}
export interface LedgerLayer {
  title: string;
  subtitle: string;
  intro: string;
  entries: LedgerEntry[];
}
export interface LedgerFiles {
  interrogationWindow: string;
  layer1: LedgerLayer | null;
  layer2: (LedgerLayer & { label: string; incident: { incident: string; timeOfDeath: string; location: string; found: string }; facilityLog: { time: string; text: string }[] }) | null;
  layer2Label: string;
  locked: { layer2: boolean };
}
export interface ArchiveMessage {
  id: number;
  ts: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: Record<string, unknown>;
}

export interface GameEvent {
  id: number;
  ts: number;
  type: string;
  payload: Record<string, unknown>;
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
export interface GameState {
  stage: StageId;
  startedAt: number | null;
  stageTimes: Partial<Record<StageId, number>>;
  geo: { attempts: number; solved: boolean; lastDistanceM: number | null };
  gate: { attempts: number; passed: boolean };
  hack: {
    guesses: string[];
    guessAt: number[];
    solved: boolean;
    lockedUntil: number | null;
    rounds: number;
    secret: string | null;
    used: string[];
    round: number;
    roundResult: HackRoundResult | null;
    lastWord: string | null;
    freePass: boolean;
    lastRound: { result: HackRoundResult; word: string; round: number; aiAttempts: number; playerAttempts: number } | null;
    ai: { guesses: string[]; guessAt: number[]; solved: boolean; thinking: boolean; plan: string[] | null; planSource: 'ai' | 'generated' | null; nextAt: number | null; lastAt: number | null };
  };
  hackScripts: { key: string; byWord: Record<string, { plan: string[]; source: 'ai' | 'generated'; at: number }>; busy: boolean };
  ledger: { layer1: boolean; layer2: boolean; layer2ReleasedAt: number | null };
  archive: { sessionId: string | null; locked: boolean; messageCount: number; busy: boolean };
  deduction: { attempts: number; passed: boolean; lastResult: GradeResult | null; lastAnswers: Record<SlotId, string> | null };
  hints: HintPush[];
  report: { markdown: string | null; generatedAt: number | null; published: boolean };
}
export interface SlotSpec {
  id: SlotId;
  label: string;
  placeholder: string;
  canonical: string;
  accept: string[];
  reject: string[];
  guidance: string;
}
export interface GameConfig {
  version: number;
  title: string;
  intro: { headline: string; body: string; buttonLabel: string };
  geo: {
    mode: 'puzzle' | 'reveal' | 'off';
    briefing: string;
    target: LatLng | null;
    radiusMeters: number;
    mapCenter: LatLng;
    mapZoom: number;
    photos: string[];
    streetView: { location: LatLng | null; heading: number; pitch: number; allowMoving: boolean };
    revealTitle: string;
    revealBody: string;
  };
  gate: { prompt: string; code: string; successText: string };
  hack: {
    mode: HackMode;
    secret: string;
    maxAttempts: number | null;
    lockoutSeconds: number;
    intro: string;
    wordBank: string[];
    aiStyle: 'scripted' | 'live';
    aiModel: string;
    aiPlanGuesses: number;
    aiPlanJitter: number;
    aiIntervalSeconds: number;
    aiJitterSeconds: number;
    aiSlowdownPerRound: number;
    aiShowLetters: boolean;
    aiThinking: boolean;
    freePass: { enabled: boolean; text: string };
  };
  reveal: { title: string; body: string; buttonLabel: string };
  ledger: { layer2Label: string; layer2ReleasedText: string; interrogationWindow: string };
  phil: { challenge: string; response: string; part1: string; part2: string; secondCaller: string };
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
export interface Overview {
  config: GameConfig;
  state: GameState;
  events: GameEvent[];
  archive: ArchiveMessage[];
  ai: {
    mode: 'live' | 'mock';
    model: string;
    credential: 'auth_token' | 'api_key' | 'oauth_token' | 'login' | 'none';
    credentialLabel: string;
    auth: 'ok' | 'needs_login' | 'unknown';
  };
  /** GOOGLE_MAPS_API_KEY is set, so the location puzzle can embed Street View. */
  streetViewKeySet: boolean;
  stages: StageId[];
}

export type WsMessage =
  | { type: 'state'; player: PlayerView }
  | { type: 'gm'; state: GameState; config: GameConfig; players?: number }
  | { type: 'event'; event: GameEvent }
  | { type: 'hint'; hint: HintPush }
  | { type: 'archive'; message: ArchiveMessage }
  | { type: 'archive_status'; busy: boolean }
  | { type: 'assistant'; message: AssistantMessage }
  | { type: 'assistant_status'; busy: boolean }
  | { type: 'assistant_proposal'; proposal: Proposal };

export interface AssistantMessage {
  id: number;
  ts: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: Record<string, unknown>;
}
export interface Proposal {
  id: number;
  ts: number;
  summary: string;
  changes: { path: string; value: unknown }[];
  status: 'pending' | 'applied' | 'dismissed';
  appliedVersion: number | null;
  decidedAt: number | null;
  preview?: { path: string; now: string; next: string }[];
}
export interface ReadinessItem {
  level: 'blocker' | 'warn' | 'info';
  area: string;
  text: string;
}
export interface AssistantView {
  messages: AssistantMessage[];
  proposals: (Proposal & { preview: { path: string; now: string; next: string }[] })[];
  readiness: ReadinessItem[];
  busy: boolean;
  live: boolean;
}
