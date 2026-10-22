// The S30 Ledger, as the player and the ARCHIVE agent may see it. The Personnel Files (layer 1 in
// the code) say who each agent is, nothing about the night; the night comes from the interviews at
// the table (docs/ACTOR-BRIEFS.md). The Surveillance Records (layer 2) are hidden until Phil's second
// call releases them: a full night in the texture of each job, one secret per agent and a couple of mildly
// odd routine lines, so density is never a tell. Nothing here names the killer: the contradiction between
// what an agent says and what the surveillance recorded is the clue. docs/LEDGER-DRAFT.md has the design notes.

export interface LogLine {
  time: string;
  text: string;
}

export interface LedgerEntry {
  /** Ledger id, S30-001 to S30-005. */
  id: string;
  name: string;
  position: string;
  /** Personnel file: the profile. Surveillance record: the additional findings. */
  notes: string;
  /** Personnel file only: its fields (service, posting). */
  facts?: { label: string; value: string }[];
  /** Surveillance record only: the recorded activity. Time first, 12-hour. */
  log?: LogLine[];
  /** Surveillance record only: the personal belongings confiscated at headquarters. */
  evidence?: string[];
}

/** One agent as the GMs edit it: the personnel file and the surveillance record together. */
export interface LedgerAgent {
  id: string;
  name: string;
  position: string;
  /** Personnel file: the fields (service, posting). */
  facts: { label: string; value: string }[];
  /** Personnel file: the profile paragraph. */
  profile: string;
  /** Surveillance record: the recorded activity, 12-hour times, in order. */
  log: LogLine[];
  /** Surveillance record: the belongings confiscated at headquarters. */
  evidence: string[];
  /** Surveillance record: the additional findings. */
  findings: string;
}

/** Everything the Ledger says, editable in the GM console. */
export interface LedgerContent {
  personnel: { subtitle: string; intro: string };
  surveillance: { subtitle: string; intro: string };
  incident: { incident: string; timeOfDeath: string; location: string; found: string };
  agents: LedgerAgent[];
  /** Surviving fragments of the Ledger index, for the ARCHIVE's lookup tool. */
  fragments: { key: string; text: string }[];
}

export const LEDGER_TITLE = 'S30 LEDGER';

const PERSONNEL_HEADER = {
  subtitle: 'SECTION 30 // CLASSIFIED PERSONNEL FILES // ACCESS LEVEL: MAGENTA',
  intro: 'Personnel files for the five agents under investigation. Where each of them was tonight is for the agents to tell you.',
};

const PERSONNEL: LedgerEntry[] = [
  {
    id: 'S30-001',
    name: 'Mara Voss',
    position: 'Security Director',
    notes: 'Strict about protocol and slow to trust anyone outside her department. Keeps antique military memorabilia in her office.',
    facts: [
      { label: 'Service', value: '15 years, internal security. Holds the security master keycard.' },
      { label: 'Posting', value: 'Security Director\'s office; oversees the control room, the armoury and the perimeter guard.' },
    ],
  },
  {
    id: 'S30-002',
    name: 'Elias Mercer',
    position: 'Systems Architect',
    notes: 'Brilliant and absent-minded; repairs old equipment rather than replacing it. Collects vintage fountain pens.',
    facts: [
      { label: 'Service', value: '11 years, systems. Server room keycard; authorised for remote maintenance from home.' },
      { label: 'Posting', value: 'Server room. Designed the original S30 Ledger infrastructure and still maintains the archive cluster.' },
    ],
  },
  {
    id: 'S30-003',
    name: 'Nina Calder',
    position: 'Intelligence Analyst',
    notes: 'Quiet and observant. Keeps detailed handwritten notes and rarely forgets a conversation.',
    facts: [
      { label: 'Service', value: '3 years, analysis. Joined after her brother\'s death on a classified operation.' },
      { label: 'Posting', value: 'Analysis wing; access to the classified reading room and archives B1.' },
    ],
  },
  {
    id: 'S30-004',
    name: 'Theo Blackwood',
    position: 'Field Operative',
    notes: 'Decorated, resourceful, skilled with improvised tools. Prefers fieldwork to paperwork.',
    facts: [
      { label: 'Service', value: '9 years, field operations, two of them listed missing in action.' },
      { label: 'Posting', value: 'Field operations; night patrol of the perimeter in unit 2, armoury access.' },
    ],
  },
  {
    id: 'S30-005',
    name: 'Celeste Rowan',
    position: 'Diplomatic Liaison',
    notes: 'Diplomatic charm and a wide network of contacts. Handwritten correspondence on personalised stationery.',
    facts: [
      { label: 'Service', value: '8 years, liaison. Fluent in six languages.' },
      { label: 'Posting', value: 'Liaison office; use of car 1 with driver and of the diplomatic residence across town.' },
    ],
  },
];

const SURVEILLANCE_HEADER = {
  subtitle: 'CLASSIFIED // MAGENTA CHANNEL // RECOVERED SURVEILLANCE & EVIDENCE RECORDS // STATUS: DECRYPTED',
  intro:
    "The following records were recovered from Section 30's internal surveillance network for 10 PM to 4 AM: badge, camera, terminal, radio and vehicle events, with the belongings confiscated from each agent at headquarters. Some information may contradict what the agents have told you.",
};

const INCIDENT = {
  incident: 'Murder of Arthur Pendelton',
  timeOfDeath: '2:14 AM',
  location: "Director's Office, secure safehouse",
  found: '4:15 AM, by duty officer Hale on the hourly round',
};

const SURVEILLANCE: LedgerEntry[] = [
  {
    id: 'S30-001',
    name: 'Mara Voss',
    position: 'Security Director',
    log: [
      { time: '10:46 PM', text: 'Control room terminal: camera 7 diagnostic run. Fault logged.' },
      { time: '11:32 PM', text: 'Maintenance window MW-2291 approved, requester S30-002.' },
      { time: '12:03 AM', text: 'Badge: north gate pedestrian door, out. In 12:26 AM.' },
      { time: '12:31 AM', text: 'Radio: check-in with unit 2 (S30-004), channel 3.' },
      { time: '1:04 AM', text: "Badge: Security Director's office, in." },
      { time: '1:50 AM', text: 'Badge: security control room, in.' },
      { time: '2:08 AM', text: 'Logged into surveillance terminal.' },
      { time: '2:09 AM', text: 'Personnel database: restricted file PF-0412 opened. Clearance override used.' },
      { time: '2:12 AM', text: 'Surveillance system recorded active monitoring, cameras 6 to 9.' },
      { time: '2:21 AM', text: 'Personnel database: PF-0412 closed.' },
      { time: '2:32 AM', text: 'Exited security control room.' },
      { time: '3:02 AM', text: 'Document created: Overnight Incident Summary (empty).' },
      { time: '3:46 AM', text: 'Badge: north gate pedestrian door, out. In 4:02 AM.' },
      { time: '4:16 AM', text: 'Badge: safehouse inner door, in.' },
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
      { time: '10:22 PM', text: 'Document created: Archive Indexer Upgrade Proposal.' },
      { time: '11:28 PM', text: "Badge: Director's Office, in. Out 11:52 PM." },
      { time: '12:09 AM', text: 'Badge: server room, in. Out 12:14 AM.' },
      { time: '12:41 AM', text: 'Badge: main entrance, out. Motor pool gate: personal vehicle out 12:44 AM.' },
      { time: '12:58 AM', text: 'Home router: workstation online.' },
      { time: '1:40 AM', text: 'Remote session opened to archive node cluster.' },
      { time: '1:52 AM', text: 'Patch set AR-114 applied to node 1.' },
      { time: '2:06 AM', text: 'Authenticated remote connection from residence (re-auth on token expiry).' },
      { time: '2:16 AM', text: 'Active remote maintenance session, node 3 patching.' },
      { time: '2:17 AM', text: 'File transfer: 41 archived documents, project folder HALCYON, to USB device (personal). Not authorized.' },
      { time: '2:38 AM', text: 'Disconnected from server.' },
      { time: '2:46 AM', text: 'Reboot cycle started by scheduled job.' },
      { time: '3:04 AM', text: 'All archive nodes reporting healthy.' },
      { time: '3:19 AM', text: 'Home router: workstation offline.' },
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
      { time: '10:31 PM', text: 'Badge: archives B1, in. 3 files signed out. Out 10:49 PM.' },
      { time: '11:18 PM', text: "Badge: Director's Office, in. Out 11:57 PM." },
      { time: '12:02 AM', text: 'Badge: analysis wing, in.' },
      { time: '12:51 AM', text: 'Decrypt terminal: batch DQ-773 opened. Flag raised on message 14. Closed 1:26 AM.' },
      { time: '1:31 AM', text: 'Badge: archives B1, in. 3 files returned. Out 1:49 AM.' },
      { time: '1:55 AM', text: 'Camera 3: seen approaching the safehouse inner door.' },
      { time: '2:11 AM', text: "Badge: Director's Office, in." },
      { time: '2:14 AM', text: 'Confirmed inside the office.' },
      { time: '2:19 AM', text: "Badge: Director's Office, out. Camera 3: toward the archives stair." },
      { time: '2:22 AM', text: 'Badge: archives B1, in. Out 2:38 AM.' },
      { time: '2:41 AM', text: 'Badge: analysis wing, in.' },
      { time: '3:14 AM', text: 'Document saved: Quarterly Audit Notes.' },
      { time: '3:41 AM', text: 'Badge: main entrance, out.' },
    ],
    evidence: ['Leather-bound notebook', 'Encrypted flash drive', 'Silver letter opener', 'Photograph of her brother'],
    notes:
      "Nina's personal notebook contains several pages of handwritten notes about a classified operation from three years earlier. The operation was officially closed, but Nina had continued researching it without authorization. Her encrypted flash drive holds a scanned index page of the S30 Ledger hard copy and a contact string matching the intermediary named in the syndicate file.",
  },
  {
    id: 'S30-004',
    name: 'Theo Blackwood',
    position: 'Field Operative',
    log: [
      { time: '10:14 PM', text: "Badge: Director's Office, in. Out 10:58 PM." },
      { time: '11:06 PM', text: 'Badge: lower level gym, in. Out 11:47 PM.' },
      { time: '12:31 AM', text: 'Radio: check-in with security control, channel 3.' },
      { time: '1:30 AM', text: 'Departed headquarters in patrol vehicle.' },
      { time: '1:39 AM', text: 'GPS: north gate.' },
      { time: '1:47 AM', text: 'GPS: stopped, restricted equipment storage facility. Stationary 8 min.' },
      { time: '1:56 AM', text: 'GPS: storage road, moving.' },
      { time: '2:05 AM', text: 'GPS: safehouse west perimeter road. Vehicle stationary.' },
      { time: '2:17 AM', text: 'Body camera recorded an active perimeter inspection, west fence.' },
      { time: '2:33 AM', text: 'GPS: west perimeter, moving.' },
      { time: '2:41 AM', text: 'Returned to headquarters. Motor pool: unit 2 in. Mileage 67.' },
      { time: '2:52 AM', text: 'GPS: unit 2 out again. East fence 2:58 AM. In 3:09 AM.' },
      { time: '3:31 AM', text: 'Armoury log: R-14 returned.' },
      { time: '3:47 AM', text: 'Document created: Patrol Report.' },
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
      { time: '10:29 PM', text: "Badge: Director's Office, in. Out 11:08 PM." },
      { time: '11:16 PM', text: 'Diplomatic pouch log: pouch DP-3310 sealed, courier 7:00 AM.' },
      { time: '11:52 PM', text: 'Badge: liaison office, out. Residence wing.' },
      { time: '12:45 AM', text: 'Departed headquarters. Motor pool: car 1 with driver.' },
      { time: '1:03 AM', text: 'Car 1 GPS: city centre.' },
      { time: '1:58 AM', text: 'Arrived at diplomatic residence.' },
      { time: '2:11 AM', text: 'Security cameras recorded her attending a meeting, residence reception room.' },
      { time: '2:40 AM', text: 'Residence visitor book: two guests, no names, "trade delegation".' },
      { time: '2:47 AM', text: 'Departed diplomatic residence.' },
      { time: '3:05 AM', text: 'Car 1 GPS: city centre.' },
      { time: '3:28 AM', text: 'Car 1 GPS: Rowan residence. Driver returns car 1 to motor pool 3:55 AM.' },
    ],
    evidence: ['Diplomatic identification card', 'Engraved fountain pen', 'Sealed diplomatic envelope', 'Small pair of stationery scissors'],
    notes:
      "Celeste's diplomatic meeting was officially registered as a routine intelligence briefing. However, recovered communications indicate the meeting was actually a private negotiation concerning an unauthorized exchange of intelligence materials.",
  },
];

/** Surviving fragments of the Ledger index, for the ARCHIVE's lookup tool. Nothing here bears on who did it. */
const FRAGMENTS: Record<string, string> = {
  'section 30':
    'Created thirty years ago to identify, contain and neutralize the most dangerous cyber threats. No public mandate, no official oversight. Authorizing names sealed.',
  ledger:
    'S30 Ledger: master index of every operative, analyst and contractor ever recruited. Classified dossiers, operational logs, secrets worth killing for. Maintained by Director Pendelton.',
  'hard copy': 'One hard copy of the S30 Ledger exists. Pendelton learned it was to be sold to an international syndicate. Its present location is not on record.',
  pendelton:
    'Arthur Pendelton. Director. Found at 04:15 in the Director’s Office inside the secure safehouse. With his last act he locked the system down and activated the emergency failsafe recovery protocol. His final dispatch named Detective Jimmy.',
  failsafe:
    'Emergency failsafe recovery protocol: scatters the recovery chain across physical and digital drops so no single insider can purge it. The personnel files open on recovery.',
  syndicate:
    'Open file: an international syndicate has approached Section 30 personnel seeking the Ledger. The buyer wanted a hard copy and the digital archives purged. Known intermediary contact string on file.',
  jimmy: 'Detective Jimmy. Left the force ten years ago. Recovery authority granted by the Director’s final dispatch. Clearance: everything that survived.',
  compound:
    'Headquarters compound: main building (ops floor, analysis wing, archives on B1, server room, security control room, armoury, mess, gym on the lower level); the secure safehouse in the inner compound with the Director’s Office; the perimeter (north gate, west perimeter road, restricted equipment storage facility on the storage road, east fence); the motor pool.',
};

/** The Ledger as shipped. The configuration carries a copy the GMs can edit. */
export const DEFAULT_LEDGER: LedgerContent = {
  personnel: PERSONNEL_HEADER,
  surveillance: SURVEILLANCE_HEADER,
  incident: INCIDENT,
  agents: PERSONNEL.map((p) => {
    const sv = SURVEILLANCE.find((x) => x.id === p.id)!;
    return { id: p.id, name: p.name, position: p.position, facts: p.facts ?? [], profile: p.notes, log: sv.log ?? [], evidence: sv.evidence ?? [], findings: sv.notes };
  }),
  fragments: Object.entries(FRAGMENTS).map(([key, text]) => ({ key, text })),
};

/** The personnel files as the phone and the ARCHIVE read them. */
export function personnelEntries(c: LedgerContent): LedgerEntry[] {
  return c.agents.map((a) => ({ id: a.id, name: a.name, position: a.position, notes: a.profile, facts: a.facts }));
}

/** The surveillance records as the phone and the ARCHIVE read them. */
export function surveillanceEntries(c: LedgerContent): LedgerEntry[] {
  return c.agents.map((a) => ({ id: a.id, name: a.name, position: a.position, notes: a.findings, log: a.log, evidence: a.evidence }));
}

export function incidentLine(c: LedgerContent): string {
  const i = c.incident;
  return `Incident: ${i.incident}. Confirmed time of death ${i.timeOfDeath}. Location: ${i.location}. Found ${i.found}.`;
}

/** Case-insensitive match on a ledger id or any part of a name. */
export function findEntries<T extends { id: string; name: string }>(entries: T[], who?: string): T[] {
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

/** Start and end minutes of a ledger time; a single time is a zero-length range. */
export function ledgerRange(time: string): [number, number] | null {
  const start = ledgerMinutes(time);
  if (start === null) return null;
  const m = /[–-]\s*(\d{1,2}:\d{2})\s*(AM|PM)/i.exec(time);
  const end = m ? ledgerMinutes(`${m[1]} ${m[2]}`) : null;
  return [start, end === null || end < start ? start : end];
}

/**
 * Parses "2:14", "2:14 AM", "02:14", "14:30" as the ARCHIVE's window bounds. A time without AM or PM reads as the
 * night of the murder, the way the detective means it: 6 to 11 are the evening, 12 is midnight, 1 to 5 the small
 * hours; 0 and 13 to 23 read as a 24-hour clock.
 */
export function parseWindow(s?: string): number | null {
  if (!s) return null;
  const t = s.trim().replace(/^(\d{1,2})\s*(AM|PM)$/i, '$1:00 $2');
  if (/AM|PM/i.test(t)) return ledgerMinutes(t);
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2] ?? '0');
  if (h > 23 || mm > 59) return null;
  const pm = h >= 13 || (h >= 6 && h <= 11);
  return ledgerMinutes(`${h % 12 || 12}:${String(mm).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`);
}

/** Place words widen to the records that belong to that place, so "safehouse" finds the Director's Office badges. */
const PLACE_ALIASES: Record<string, string[]> = {
  safehouse: ['safehouse', "director's office", 'inner door', 'inner corridor', 'camera 3'],
  office: ['office'],
  archives: ['archives', 'archive'],
  archive: ['archives', 'archive'],
  perimeter: ['perimeter', 'fence', 'gate', 'patrol'],
  storage: ['storage'],
  server: ['server', 'node', 'rack'],
  control: ['control room', 'surveillance terminal'],
  mess: ['mess'],
  residence: ['residence'],
};

export interface SearchHit {
  layer: 1 | 2;
  /** Agent id. */
  who: string;
  name: string;
  time: string;
  text: string;
}

/** Search the open layers by agent, time window and free text. `place` and `keyword` both match the line text, case-insensitively. */
export function searchLedger(c: LedgerContent, opts: { who?: string; from?: string; to?: string; text?: string; layers: { 1: boolean; 2: boolean } }): SearchHit[] {
  const a = parseWindow(opts.from);
  const b = parseWindow(opts.to);
  const words = (opts.text ?? '')
    .toLowerCase()
    .split(/[\s,/]+/)
    .map((w) => w.replace(/^["']|["']$/g, ''))
    .filter((w) => w.length > 1 && !['the', 'and', 'or', 'at', 'in', 'to', 'of', 'any', 'all'].includes(w))
    .flatMap((w) => PLACE_ALIASES[w] ?? [w]);
  // A range such as 2:00–2:30 counts when it overlaps the window.
  const inWindow = (time: string) => {
    const r = ledgerRange(time);
    if (r === null) return true;
    if (a !== null && r[1] < a) return false;
    if (b !== null && r[0] > b) return false;
    return true;
  };
  const matches = (text: string, time: string) => !words.length || words.some((w) => text.toLowerCase().includes(w) || time.toLowerCase().includes(w));
  const hits: SearchHit[] = [];
  // Personnel files have no times: their fields answer a word search when no window was asked for.
  if (opts.layers[1] && a === null && b === null)
    for (const e of findEntries(personnelEntries(c), opts.who)) {
      const fields = [...(e.facts ?? []).map((f) => `${f.label}: ${f.value}`), `Profile: ${e.notes}`];
      for (const f of fields) if (words.length && matches(f, '')) hits.push({ layer: 1, who: e.id, name: e.name, time: 'file', text: f });
    }
  if (opts.layers[2]) {
    for (const e of findEntries(surveillanceEntries(c), opts.who)) for (const l of e.log ?? []) if (inWindow(l.time) && matches(l.text, l.time)) hits.push({ layer: 2, who: e.id, name: e.name, time: l.time, text: l.text });
  }
  return hits.sort((x, y) => (ledgerMinutes(x.time) ?? 0) - (ledgerMinutes(y.time) ?? 0) || x.layer - y.layer);
}

export function formatHits(hits: SearchHit[], max = 60): string {
  if (!hits.length) return 'No records match.';
  const lines = hits.slice(0, max).map((h) => `L${h.layer} ${h.time.padEnd(13)} ${h.name}: ${h.text}`);
  if (hits.length > max) lines.push(`[${hits.length - max} more records. Narrow the query.]`);
  return lines.join('\n');
}

export function formatEntry(e: LedgerEntry, layer: 1 | 2): string {
  const head = `${e.id} :: ${e.name} :: ${e.position}`;
  const log = (e.log ?? []).map((l) => `${l.time} ${l.text}`).join('\n');
  if (layer === 1) return `${head}\n${(e.facts ?? []).map((f) => `${f.label}: ${f.value}`).join('\n')}\nProfile: ${e.notes}`;
  return `${head}\nRecorded activity:\n${log}\nRecovered evidence: ${(e.evidence ?? []).join('; ')}\nAdditional findings: ${e.notes}`;
}
