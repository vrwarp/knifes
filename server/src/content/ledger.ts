// The S30 Ledger, as the player and the ARCHIVE agent may see it. Layer 01 is the personnel layer
// with each agent's self-reported activity log; Layer 02 is the recovered surveillance and evidence
// layer that Phil's second call releases. Nothing here names the killer: the contradiction between
// the two layers is the clue.

export interface LedgerEntry {
  /** Ledger id, S30-001 to S30-005. */
  id: string;
  name: string;
  position: string;
  /** Layer 01: the personnel profile. Layer 02: the additional findings. */
  notes: string;
  /** Layer 01: the self-reported activity log. Layer 02: the verified activity. One line per entry, time first. */
  log: { time: string; text: string }[];
  /** Layer 02 only: the personal belongings confiscated at headquarters. */
  evidence?: string[];
}

export const LEDGER_TITLE = 'S30 LEDGER';

export const LAYER_01_HEADER = {
  title: 'S30 LEDGER // LAYER 01',
  subtitle: 'SECTION 30 // CLASSIFIED PERSONNEL RECORDS // ACCESS LEVEL: MAGENTA',
  intro: 'Personnel dossiers and self-reported activity logs for the five agents under investigation.',
};

export const LAYER_01: LedgerEntry[] = [
  {
    id: 'S30-001',
    name: 'Mara Voss',
    position: 'Security Director',
    notes:
      'A veteran of Section 30, Mara has overseen internal security for over 15 years. Known for her strict adherence to protocol, she rarely trusts anyone outside her department. She maintains a collection of antique military memorabilia in her office.',
    log: [
      { time: '6:30 PM', text: 'Met Pendelton in his office.' },
      { time: '10:45 PM', text: 'Inspected security systems.' },
      { time: '1:50 AM', text: 'Entered security control room.' },
      { time: '2:00–2:30 AM', text: 'Reviewing surveillance footage.' },
    ],
  },
  {
    id: 'S30-002',
    name: 'Elias Mercer',
    position: 'Systems Architect',
    notes:
      'Elias helped design the original S30 Ledger infrastructure. Brilliant but absent-minded, he prefers working alone and has a habit of repairing outdated equipment rather than replacing it. He collects vintage fountain pens and mechanical writing instruments.',
    log: [
      { time: '7:15 PM', text: 'Worked in the server room.' },
      { time: '11:30 PM', text: 'Met Pendelton about system upgrades.' },
      { time: '1:40 AM', text: 'Began server maintenance.' },
      { time: '2:00–2:30 AM', text: 'Working remotely from home.' },
    ],
  },
  {
    id: 'S30-003',
    name: 'Nina Calder',
    position: 'Intelligence Analyst',
    notes:
      "Nina specializes in decoding encrypted communications and analyzing intelligence reports. She joined Section 30 following her brother's death during a classified operation. Quiet and observant, she is known for keeping detailed handwritten notes and rarely forgetting a conversation.",
    log: [
      { time: '8:00 PM', text: 'Reviewed classified mission files.' },
      { time: '11:20 PM', text: 'Discussed an investigation with Pendelton.' },
      { time: '1:55 AM', text: "Seen near the Director's Office." },
      // The dossier's self-report had her in the Director's office here. It now claims the archives, so Layer 02 catches the lie.
      { time: '2:00–2:30 AM', text: 'Working in the archives.' },
    ],
  },
  {
    id: 'S30-004',
    name: 'Theo Blackwood',
    position: 'Field Operative',
    notes:
      'A decorated field operative, Theo specializes in reconnaissance and extraction missions. He spent two years missing in action before returning to Section 30. He is highly resourceful, skilled with improvised tools, and prefers fieldwork over administrative duties.',
    log: [
      { time: '7:45 PM', text: 'Returned to headquarters.' },
      { time: '10:15 PM', text: 'Met Pendelton for a mission debriefing.' },
      { time: '1:30 AM', text: 'Departed on security patrol.' },
      { time: '2:00–2:30 AM', text: 'Vehicle GPS places him outside the safehouse.' },
    ],
  },
  {
    id: 'S30-005',
    name: 'Celeste Rowan',
    position: 'Diplomatic Liaison',
    notes:
      "Celeste manages Section 30's international intelligence partnerships. Fluent in six languages, she is known for her diplomatic charm and extensive network of contacts. She frequently exchanges handwritten correspondence and keeps a personalized stationery set in her office.",
    log: [
      { time: '6:00 PM', text: 'Attended executive briefing.' },
      { time: '10:30 PM', text: 'Met privately with Pendelton.' },
      { time: '12:45 AM', text: 'Left for a diplomatic meeting.' },
      { time: '2:00–2:30 AM', text: 'Attending a meeting across town.' },
    ],
  },
];

export const LAYER_02_HEADER = {
  title: 'S30 LEDGER // LAYER 02',
  subtitle: 'CLASSIFIED // MAGENTA CHANNEL // RECOVERED SURVEILLANCE & EVIDENCE RECORDS // STATUS: DECRYPTED',
  intro:
    "The following records were recovered from Section 30's internal surveillance network. Some information may contradict previously submitted activity logs.",
};

export const INCIDENT = {
  incident: 'Murder of Arthur Pendelton',
  timeOfDeath: '2:14 AM',
  location: "Director's Office, secure safehouse",
};

export const LAYER_02: LedgerEntry[] = [
  {
    id: 'S30-001',
    name: 'Mara Voss',
    position: 'Security Director',
    log: [
      { time: '1:50 AM', text: 'Entered security control room.' },
      { time: '2:08 AM', text: 'Logged into surveillance terminal.' },
      { time: '2:14 AM', text: 'Surveillance system recorded active monitoring.' },
      { time: '2:32 AM', text: 'Exited security control room.' },
    ],
    evidence: ['Security master keycard', 'Antique pocket watch', 'Folding utility knife', 'Security inspection checklist'],
    notes:
      'Security records indicate Mara accessed a restricted personnel file at 2:09 AM, despite claiming she was only reviewing surveillance footage. The file concerned an internal disciplinary investigation unrelated to Pendelton.',
  },
  {
    id: 'S30-002',
    name: 'Elias Mercer',
    position: 'Systems Architect',
    log: [
      { time: '1:40 AM', text: 'Began remote server maintenance.' },
      { time: '2:06 AM', text: 'Authenticated remote connection from residence.' },
      { time: '2:14 AM', text: 'Active remote maintenance session.' },
      { time: '2:38 AM', text: 'Disconnected from server.' },
    ],
    evidence: ['Encrypted USB drive', 'Vintage fountain pen', 'Precision screwdriver set', 'Server access keycard'],
    notes:
      'System logs show Elias copied several archived technical documents onto his personal encrypted USB drive at 2:17 AM. The documents appear to be schematics for an abandoned Section 30 project. The transfer was not authorized.',
  },
  {
    id: 'S30-003',
    name: 'Nina Calder',
    position: 'Intelligence Analyst',
    log: [
      { time: '1:55 AM', text: "Seen approaching the Director's Office." },
      { time: '2:11 AM', text: "Accessed the Director's Office using her security badge." },
      { time: '2:14 AM', text: 'Confirmed inside the office.' },
      { time: '2:19 AM', text: 'Exited the office toward the archives.' },
    ],
    evidence: ['Leather-bound notebook', 'Encrypted flash drive', 'Silver letter opener', 'Photograph of her brother'],
    notes:
      "Nina's personal notebook contains several pages of handwritten notes about a classified operation from three years earlier. The operation was officially closed, but Nina had continued researching it without authorization.",
  },
  {
    id: 'S30-004',
    name: 'Theo Blackwood',
    position: 'Field Operative',
    log: [
      { time: '1:30 AM', text: 'Departed headquarters in patrol vehicle.' },
      { time: '2:05 AM', text: 'Vehicle recorded at western perimeter.' },
      { time: '2:14 AM', text: 'Body camera recorded an active perimeter inspection.' },
      { time: '2:41 AM', text: 'Returned to headquarters.' },
    ],
    evidence: ['Tactical flashlight', 'Combat knife', 'Military identification tags', 'Handheld radio'],
    notes:
      "Theo's patrol report omitted an unscheduled stop at 1:47 AM near a restricted equipment storage facility. Vehicle GPS confirms he remained there for approximately eight minutes before continuing his patrol.",
  },
  {
    id: 'S30-005',
    name: 'Celeste Rowan',
    position: 'Diplomatic Liaison',
    log: [
      { time: '12:45 AM', text: 'Departed headquarters.' },
      { time: '1:58 AM', text: 'Arrived at diplomatic residence.' },
      { time: '2:14 AM', text: 'Security cameras recorded her attending a meeting.' },
      { time: '2:47 AM', text: 'Departed diplomatic residence.' },
    ],
    evidence: ['Diplomatic identification card', 'Engraved fountain pen', 'Sealed diplomatic envelope', 'Small pair of stationery scissors'],
    notes:
      "Celeste's diplomatic meeting was officially registered as a routine intelligence briefing. However, recovered communications indicate the meeting was actually a private negotiation concerning an unauthorized exchange of intelligence materials.",
  },
];

/** Surviving fragments of the Ledger index, for the ARCHIVE's lookup tool. Nothing here bears on who did it. */
export const LEDGER_FRAGMENTS: Record<string, string> = {
  'section 30':
    'Created thirty years ago to identify, contain and neutralize the most dangerous cyber threats. No public mandate, no official oversight. Authorizing names sealed.',
  ledger:
    'S30 Ledger: master index of every operative, analyst and contractor ever recruited. Classified dossiers, operational logs, secrets worth killing for. Maintained by Director Pendelton.',
  'hard copy': 'One hard copy of the S30 Ledger exists. Pendelton learned it was to be sold to an international syndicate. Its present location is not on record.',
  pendelton:
    "Arthur Pendelton. Director. Found at 04:15 in the secure safehouse. With his last act he locked the system down and activated the emergency failsafe recovery protocol. His final dispatch named Detective Jimmy.",
  failsafe:
    'Emergency failsafe recovery protocol: scatters the recovery chain across physical and digital drops so no single insider can purge it. Layer 01 opens on recovery. Layer 02 needs a second authorisation.',
  syndicate:
    'Open file: an international syndicate has approached Section 30 personnel seeking the Ledger. The buyer wanted a hard copy and the digital archives purged.',
  jimmy: 'Detective Jimmy. Left the force ten years ago. Recovery authority granted by the Director’s final dispatch. Clearance: everything that survived.',
  'layer 02': 'Layer 02: recovered surveillance and evidence records, sealed until a second recovery authorisation arrives.',
};

/** Case-insensitive match on a ledger id or any part of a name. */
export function findEntries(entries: LedgerEntry[], who?: string): LedgerEntry[] {
  const q = (who ?? '').trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.name.toLowerCase().split(' ').some((p) => p.startsWith(q)));
}

/** Minutes since 6 PM for a ledger time such as "2:14 AM" or the start of "2:00–2:30 AM"; null when unreadable. */
export function ledgerMinutes(time: string): number | null {
  const m = /(\d{1,2}):(\d{2})(?:\s*[–-]\s*\d{1,2}:\d{2})?\s*(AM|PM)/i.exec(time);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  const abs = h * 60 + Number(m[2]);
  // The evening runs 6 PM to 4 AM, so anything before noon belongs to the next day.
  return abs < 12 * 60 ? abs + 24 * 60 - 18 * 60 : abs - 18 * 60;
}

export function formatEntry(e: LedgerEntry, layer: 1 | 2): string {
  const head = `${e.id} :: ${e.name} :: ${e.position}`;
  const log = e.log.map((l) => `${l.time} ${l.text}`).join('\n');
  if (layer === 1) return `${head}\nProfile: ${e.notes}\nSelf-reported activity:\n${log}`;
  return `${head}\nVerified activity:\n${log}\nRecovered evidence: ${(e.evidence ?? []).join('; ')}\nAdditional findings: ${e.notes}`;
}
