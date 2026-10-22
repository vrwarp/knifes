export type StageId = 'intro' | 'geo' | 'gate' | 'hack' | 'reveal' | 'investigation';
export const STAGE_ORDER: StageId[] = ['intro', 'geo', 'gate', 'hack', 'reveal', 'investigation'];
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

export interface UiText {
  stageLabels: { intro: string; geo: string; gate: string; hack: string; reveal: string; investigation: string };
  app: {
    loadingTitle: string;
    loading: string;
    linkLost: string;
    accessDeniedTitle: string;
    accessDeniedBody: string;
    transmissionKicker: string;
    transmissionTitle: string;
    acknowledge: string;
    /** {n} is the count. */
    transmissions: string;
    transmissionsReceived: string;
    skipHint: string;
  };
  geo: {
    title: string;
    /** {distance} is how far the marker was, or "far". */
    mismatch: string;
    feedHelp: string;
    feedHelpMoving: string;
    photosMissing: string;
    photosHelp: string;
    mapHelp: string;
    mapHelpAfterFeed: string;
    triangulate: string;
    proceed: string;
    openInMaps: string;
    returnToLine: string;
    unlockMap: string;
    lockMap: string;
    feedNone: string;
    feedFailed: string;
    feedLoading: string;
    feedUnlock: string;
    feedBack: string;
    feedLock: string;
    /** {n} is the count. */
    attempts: string;
  };
  gate: { kicker: string; title: string; back: string; command: string; keyLabel: string; rejected: string; submit: string; statusLeft: string; statusMid: string; attempts: string };
  hack: {
    kicker: string;
    title: string;
    partition: string;
    /** {n} is the key length. */
    heading: string;
    adversaryWarning: string;
    legendPlaced: string;
    legendMisplaced: string;
    legendAbsent: string;
    engage: string;
    /** {n} is the key length. */
    command: string;
    adversaryFlag: string;
    /** {round}, {word}, {n}. */
    raceLostToAdversary: string;
    raceLostSurvived: string;
    newKey: string;
    you: string;
    adversary: string;
    advBeaten: string;
    advRecovered: string;
    advExhausted: string;
    advThinking: string;
    advStandby: string;
    noAttempts: string;
    accepted: string;
    locked: string;
    /** {word}. */
    keyWas: string;
    resetIn: string;
    reset: string;
    attempt: string;
    statusLeft: string;
    /** {n} is the key length. */
    keyspace: string;
    /** {n}. */
    resets: string;
  };
  ledger: {
    mounting: string;
    notDecrypted: string;
    /** {id}. */
    idLine: string;
    profileHeading: string;
    activityHeading: string;
    evidenceHeading: string;
    findingsHeading: string;
    incidentLabel: string;
    timeOfDeathLabel: string;
    locationLabel: string;
    foundLabel: string;
  };
  archive: {
    processingLines: string[];
    /** {n} is the integrity percentage. */
    integrity: string;
    speakerArchive: string;
    speakerPlayer: string;
    speakerLink: string;
    sealed: string;
    offline: string;
    placeholder: string;
    send: string;
  };
  /** Lines the server sends back to the phone. */
  server: {
    /** {n}. */
    keyLength: string;
    partitionLocked: string;
    archiveOffline: string;
    archiveSealed: string;
    archiveBusy: string;
    archiveEmptyReply: string;
    archiveDegraded: string;
  };
}

/** Replaces {name} placeholders; unknown names are left as written. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export interface LedgerAgent {
  id: string;
  name: string;
  position: string;
  facts: { label: string; value: string }[];
  profile: string;
  log: { time: string; text: string }[];
  evidence: string[];
  findings: string;
}
export interface LedgerContent {
  personnel: { subtitle: string; intro: string };
  surveillance: { subtitle: string; intro: string };
  incident: { incident: string; timeOfDeath: string; location: string; found: string };
  agents: LedgerAgent[];
  fragments: { key: string; text: string }[];
}

export interface PlayerView {
  /** Server revision; a view older than one already shown is ignored. */
  rev: number;
  title: string;
  /** Rises with every saved configuration; the Ledger re-reads its files when it does. */
  configVersion: number;
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
    /** The answer; only sent once the location is confirmed (solved, or reveal mode). */
    target: LatLng | null;
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
  ledger: { layer1: boolean; layer2: boolean; layer1Label: string; layer2Label: string; interrogationWindow: string; headLine: string; recordLabel: string };
  text: UiText;
  archive: { enabled: boolean; locked: boolean; busy: boolean; welcome: string; maxMessageChars: number; epoch: number };
  hints: HintPush[];
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
  layer2: (LedgerLayer & { label: string; incident: { incident: string; timeOfDeath: string; location: string; found: string }}) | null;
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
  hints: HintPush[];
  report: { markdown: string | null; generatedAt: number | null };
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
  ledger: {
    layer1Label: string;
    layer2Label: string;
    layer2ReleasedText: string;
    interrogationWindow: string;
    headLine: string;
    recordLabel: string;
    content: LedgerContent;
  };
  phil: { challenge: string; response: string; part1: string; part2: string; secondCaller: string };
  archive: { enabled: boolean; maxMessageChars: number; welcome: string; persona: string; notOnFile: string };
  hints: { quick: Partial<Record<StageId, string[]>> };
  report: { prompt: string };
  text: UiText;
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
