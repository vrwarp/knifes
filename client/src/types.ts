export type StageId = 'intro' | 'geo' | 'gate' | 'hack' | 'reveal' | 'investigation' | 'solved';
export const STAGE_ORDER: StageId[] = ['intro', 'geo', 'gate', 'hack', 'reveal', 'investigation', 'solved'];
export type SlotId = 'time' | 'suspect' | 'method' | 'asset' | 'motive' | 'prop';
export type LetterState = 'hit' | 'near' | 'miss';
export type HackMode = 'solo' | 'race';
export type HackRoundResult = 'player' | 'ai' | 'exhausted';
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
  evidenceGateMode: 'after_hack' | 'passcodes';
  intro: { headline: string; body: string; buttonLabel: string };
  geo: {
    briefing: string;
    mapCenter: LatLng;
    mapZoom: number;
    photos: string[];
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
    solved: boolean;
    lockedUntil: number | null;
    rounds: number;
    roundResult: HackRoundResult | null;
    lastWord: string | null;
    ai: {
      /** Letters are blank unless the GM chose to show them. */
      rows: LetterScore[][];
      attempts: number;
      solved: boolean;
      thinking: boolean;
      nextAt: number | null;
      /** When the countdown to nextAt began, for the progress bar. */
      sinceAt: number | null;
      exhausted: boolean;
    } | null;
  };
  reveal: { title: string; body: string; buttonLabel: string };
  evidence: { unlocked: { logs: boolean; audio: boolean; toxicology: boolean; manifest: boolean }; hasAudio: boolean; audioNotes: string };
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

export interface AccessLogRow {
  time: string;
  badge: string;
  name: string;
  door: string;
  event: string;
}
export interface Dossier {
  codename: string;
  badge: string;
  role: string;
  clearance: string;
  relationship: string;
  publicNotes: string;
}
export interface EvidenceFiles {
  gateMode: 'after_hack' | 'passcodes';
  note: string;
  logs: { rows: AccessLogRow[]; cameras: string[] } | null;
  manifest: Dossier[] | null;
  toxicology: string | null;
  intercept: { notes: string; hasAudio: boolean } | null;
  locked: { logs: boolean; manifest: boolean; toxicology: boolean; audio: boolean };
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
    solved: boolean;
    lockedUntil: number | null;
    rounds: number;
    secret: string | null;
    used: string[];
    round: number;
    roundResult: HackRoundResult | null;
    lastWord: string | null;
    ai: { guesses: string[]; solved: boolean; thinking: boolean; nextAt: number | null; lastAt: number | null };
  };
  evidence: { unlocked: { logs: boolean; audio: boolean; toxicology: boolean; manifest: boolean } };
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
    aiModel: string;
    aiIntervalSeconds: number;
    aiJitterSeconds: number;
    aiSlowdownPerRound: number;
    aiShowLetters: boolean;
    aiThinking: boolean;
  };
  reveal: { title: string; body: string; buttonLabel: string };
  evidence: {
    gateMode: 'after_hack' | 'passcodes';
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
  stages: StageId[];
}

export type WsMessage =
  | { type: 'state'; player: PlayerView }
  | { type: 'gm'; state: GameState; config: GameConfig; players?: number }
  | { type: 'event'; event: GameEvent }
  | { type: 'hint'; hint: HintPush }
  | { type: 'archive'; message: ArchiveMessage }
  | { type: 'archive_status'; busy: boolean };
