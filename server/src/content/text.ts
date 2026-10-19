// Every line the phone prints that is not already part of a stage's own configuration: stage labels,
// the console chrome that carries the fiction (prompts, status words, rejection lines), the ARCHIVE's
// processing lines. The configuration carries a copy the GMs can edit;
// {placeholders} are filled at render time.

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

export const DEFAULT_TEXT: UiText = {
  stageLabels: {
    intro: 'Recovery chain // link 1',
    geo: 'Recovery chain // field transmission',
    gate: 'Recovery chain // secure line',
    hack: 'Recovery chain // ledger key',
    reveal: 'Ledger decrypted',
    investigation: 'Investigation',
  },
  app: {
    loadingTitle: 'Section 30',
    loading: 'Establishing link',
    linkLost: 'Link lost · reconnecting',
    accessDeniedTitle: 'Access denied',
    accessDeniedBody: 'This terminal only answers to the recovery link. Scan the code again, or open the link exactly as it was given to you.',
    transmissionKicker: 'Incoming transmission',
    transmissionTitle: 'Magenta channel',
    acknowledge: 'Acknowledge',
    transmissions: 'Transmissions ({n})',
    transmissionsReceived: 'Transmissions received',
    skipHint: 'tap the text to skip',
  },
  geo: {
    title: 'Field transmission',
    mismatch: 'SIGNAL MISMATCH. Marker is {distance} from the source.',
    feedHelp: 'Unlock the feed, drag to look around.',
    feedHelpMoving: 'Unlock the feed, drag to look around, tap the arrows to move.',
    photosMissing: '[IMAGE BURST NOT YET RECOVERED]',
    photosHelp: 'Tap a photo to enlarge it.',
    mapHelp: 'Unlock the map, find the spot, tap to drop the marker, then triangulate.',
    mapHelpAfterFeed: 'Then unlock the map, find the spot, tap to drop the marker, and triangulate.',
    triangulate: 'Triangulate',
    proceed: 'Proceed',
    openInMaps: 'Open in Google Maps',
    returnToLine: 'Return to secure line',
    unlockMap: 'Tap to unlock map',
    lockMap: 'Lock map',
    feedNone: '[FEED OFFLINE: NO STREET-LEVEL IMAGERY AT THE SOURCE]',
    feedFailed: '[FEED OFFLINE: STREET VIEW FAILED TO LOAD]',
    feedLoading: '[RECOVERING FEED]',
    feedUnlock: 'Tap to look around',
    feedBack: 'Back to start',
    feedLock: 'Lock feed',
    attempts: 'Attempts: {n}',
  },
  gate: {
    kicker: 'sec-30 terminal // tty1',
    title: 'Secure line',
    back: 'Back to location',
    command: 'auth --recovery-key',
    keyLabel: 'Recovery key',
    rejected: 'KEY REJECTED',
    submit: 'Submit key',
    statusLeft: 'SECURE LINE',
    statusMid: 'AWAITING KEY',
    attempts: 'attempts: {n}',
  },
  hack: {
    kicker: 'sec-30 terminal // tty1',
    title: 'Brute-force key',
    partition: 'partition 30-beta',
    heading: 'Brute-force the {n}-character key',
    adversaryWarning: 'An adversary process is working the same key. Find it first or the key rotates.',
    legendPlaced: 'placed',
    legendMisplaced: 'misplaced',
    legendAbsent: 'absent',
    engage: 'Engage',
    command: 'breach --key {n}',
    adversaryFlag: '--adversary',
    raceLostToAdversary: 'race {round} lost: adversary took {word} in {n}.',
    raceLostSurvived: 'race {round} lost: {word} survived {n}.',
    newKey: 'new key issued.',
    you: 'You',
    adversary: 'Adversary',
    advBeaten: 'beaten at {n}',
    advRecovered: 'recovered the key',
    advExhausted: 'exhausted',
    advThinking: 'thinking...',
    advStandby: 'standing by',
    noAttempts: 'no attempts',
    accepted: 'KEY ACCEPTED. DECRYPTING PARTITION',
    locked: 'PARTITION LOCKED',
    keyWas: 'the key was {word}',
    resetIn: 'reset in',
    reset: 'Reset partition',
    attempt: 'Attempt key',
    statusLeft: 'SEC-30 // 30-BETA',
    keyspace: 'KEYSPACE 26^{n}',
    resets: 'Partition resets: {n}',
  },
  ledger: {
    mounting: 'Mounting Ledger',
    notDecrypted: 'Not yet decrypted.',
    idLine: 'Ledger id {id}',
    profileHeading: 'Personnel profile',
    activityHeading: 'Recorded activity',
    evidenceHeading: 'Recovered evidence',
    findingsHeading: 'Additional findings',
    incidentLabel: 'Incident:',
    timeOfDeathLabel: 'Confirmed time of death:',
    locationLabel: 'Location:',
    foundLabel: 'Found:',
  },
  archive: {
    processingLines: ['ARCHIVE PROCESSING', 'SEARCHING SURVIVING SEGMENTS', 'CROSS-CHECKING THE INDEX', 'SEGMENT 7 CORRUPT. REROUTING', 'ASSEMBLING RECORD'],
    integrity: 'ARCHIVE · integrity {n}%',
    speakerArchive: 'ARCHIVE',
    speakerPlayer: 'Detective',
    speakerLink: 'LINK',
    sealed: 'ARCHIVE SEALED BY COMMAND AUTHORITY',
    offline: 'ARCHIVE OFFLINE',
    placeholder: 'Query the ARCHIVE',
    send: 'Send',
  },
  server: {
    keyLength: 'Key must be {n} characters',
    partitionLocked: 'Partition locked',
    archiveOffline: 'ARCHIVE offline',
    archiveSealed: 'ARCHIVE sealed by command authority',
    archiveBusy: 'ARCHIVE is answering a previous query',
    archiveEmptyReply: '[SEGMENT LOST] The partition returned nothing. Rephrase the query.',
    archiveDegraded: '[LINK DEGRADED] The ARCHIVE did not answer. Repeat the query.',
  },
};

/** Replaces {name} placeholders; unknown names are left as written. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
