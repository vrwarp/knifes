// The S30 Ledger, as the player and the ARCHIVE agent may see it. Layer 01 is the personnel layer
// with each agent's self-reported night; Layer 02 is the recorded surveillance and evidence layer that
// Phil's second call releases. Every agent gets a full night in the texture of their job, one secret in
// Layer 02 and a couple of mildly odd routine lines, so density is never a tell. Nothing here names the
// killer: the contradiction between the two layers is the clue. docs/LEDGER-DRAFT.md has the design notes.

export interface LogLine {
  time: string;
  text: string;
}

export interface LedgerEntry {
  /** Ledger id, S30-001 to S30-005. */
  id: string;
  name: string;
  position: string;
  /** Layer 01: the personnel profile. Layer 02: the additional findings. */
  notes: string;
  /** Layer 01: the self-reported activity. Layer 02: the recorded activity. Time first, 12-hour. */
  log: LogLine[];
  /** Layer 02 only: the personal belongings confiscated at headquarters. */
  evidence?: string[];
}

export const LEDGER_TITLE = 'S30 LEDGER';

export const LAYER_01_HEADER = {
  title: 'S30 LEDGER // LAYER 01',
  subtitle: 'SECTION 30 // CLASSIFIED PERSONNEL RECORDS // ACCESS LEVEL: MAGENTA',
  intro: 'Personnel dossiers and self-reported activity for the five agents under investigation, 6 PM to 4 AM.',
};

export const LAYER_01: LedgerEntry[] = [
  {
    id: 'S30-001',
    name: 'Mara Voss',
    position: 'Security Director',
    notes:
      'A veteran of Section 30, Mara has overseen internal security for over 15 years. Known for her strict adherence to protocol, she rarely trusts anyone outside her department. She maintains a collection of antique military memorabilia in her office.',
    log: [
      { time: '6:00 PM', text: 'Shift handover from day security. Nothing outstanding.' },
      { time: '6:30 PM', text: 'Met Pendelton in his office. Weekly security review.' },
      { time: '7:10 PM', text: 'Walked the inner compound. Safehouse doors and locks checked.' },
      { time: '8:00 PM', text: "Reviewed visitor list for tomorrow's liaison meeting." },
      { time: '9:10 PM', text: 'Mess with the night shift.' },
      { time: '9:45 PM', text: 'Signed the armoury count. R-14 still out to Blackwood since 6:40.' },
      { time: '10:45 PM', text: 'Inspected security systems. Camera 7 (storage road) flickering; ticket raised.' },
      { time: '11:30 PM', text: "Approved Mercer's overnight maintenance window on the servers." },
      { time: '12:00 AM', text: 'Perimeter round with the night guard. All gates secure.' },
      { time: '12:30 AM', text: 'Radio check with Blackwood before his patrol.' },
      { time: '1:00 AM', text: 'Paperwork in my office.' },
      { time: '1:50 AM', text: 'Entered security control room.' },
      { time: '2:00–2:30 AM', text: 'Reviewing surveillance footage, camera 7 fault.' },
      { time: '2:35 AM', text: 'Returned to my office.' },
      { time: '3:00 AM', text: 'Began the overnight incident summary. Nothing to report.' },
      { time: '3:45 AM', text: 'Rounds to the north gate and back.' },
      { time: '4:15 AM', text: 'Called to the safehouse by duty officer Hale.' },
    ],
  },
  {
    id: 'S30-002',
    name: 'Elias Mercer',
    position: 'Systems Architect',
    notes:
      'Elias helped design the original S30 Ledger infrastructure. Brilliant but absent-minded, he prefers working alone and has a habit of repairing outdated equipment rather than replacing it. He collects vintage fountain pens and mechanical writing instruments.',
    log: [
      { time: '6:20 PM', text: 'Arrived. Coffee. Read overnight alerts from the Ledger cluster.' },
      { time: '7:15 PM', text: 'Worked in the server room. Replaced a failing drive in rack 3.' },
      { time: '8:40 PM', text: 'Rebuilt the array. Waited for the parity check.' },
      { time: '9:30 PM', text: 'Ate at my desk.' },
      { time: '10:20 PM', text: 'Wrote the upgrade proposal for the archive indexer.' },
      { time: '11:30 PM', text: 'Met Pendelton about system upgrades. He wants the indexer done this quarter.' },
      { time: '12:10 AM', text: 'Packed up. Left the proposal on his desk.' },
      { time: '12:40 AM', text: 'Left headquarters. Drove home.' },
      { time: '1:10 AM', text: 'Home. Tea.' },
      { time: '1:40 AM', text: 'Began server maintenance from my home workstation.' },
      { time: '2:00–2:30 AM', text: 'Working remotely from home. Patching the archive nodes.' },
      { time: '2:45 AM', text: 'Patching complete. Reboot cycle.' },
      { time: '3:00 AM', text: 'Watched the nodes come back. All green.' },
      { time: '3:20 AM', text: 'Logged off. Bed.' },
    ],
  },
  {
    id: 'S30-003',
    name: 'Nina Calder',
    position: 'Intelligence Analyst',
    notes:
      "Nina specializes in decoding encrypted communications and analyzing intelligence reports. She joined Section 30 following her brother's death during a classified operation. Quiet and observant, she is known for keeping detailed handwritten notes and rarely forgetting a conversation.",
    log: [
      { time: '6:15 PM', text: 'Analysis wing. Picked up the overnight decrypt queue.' },
      { time: '7:00 PM', text: 'Decrypt batch 1 of 3. Routine traffic.' },
      { time: '8:00 PM', text: 'Reviewed classified mission files for the quarterly audit.' },
      { time: '9:00 PM', text: 'Mess. Alone.' },
      { time: '9:40 PM', text: 'Decrypt batch 2 of 3.' },
      { time: '10:30 PM', text: 'Pulled three files from the archives for the audit.' },
      { time: '11:20 PM', text: 'Discussed an investigation with Pendelton.' },
      { time: '12:00 AM', text: 'Back in the analysis wing. Wrote up the audit notes.' },
      { time: '12:50 AM', text: 'Decrypt batch 3 of 3. One malformed message, flagged.' },
      { time: '1:30 AM', text: 'Returned the audit files to the archives.' },
      { time: '1:55 AM', text: 'Passed the safehouse on the way back from the archives.' },
      // The dossier's self-report had her in the Director's office here. It now claims the archives, so Layer 02 catches the lie.
      { time: '2:00–2:30 AM', text: 'Working in the archives. Re-shelving and cross-referencing.' },
      { time: '2:40 AM', text: 'Analysis wing. Closed out the decrypt queue.' },
      { time: '3:15 AM', text: 'Filed the audit notes.' },
      { time: '3:40 AM', text: 'Left for the night.' },
    ],
  },
  {
    id: 'S30-004',
    name: 'Theo Blackwood',
    position: 'Field Operative',
    notes:
      'A decorated field operative, Theo specializes in reconnaissance and extraction missions. He spent two years missing in action before returning to Section 30. He is highly resourceful, skilled with improvised tools, and prefers fieldwork over administrative duties.',
    log: [
      { time: '6:10 PM', text: 'Vehicle check, patrol unit 2. Fuel, radio, body camera battery.' },
      { time: '6:40 PM', text: 'Armoury: signed out handheld radio R-14.' },
      { time: '7:45 PM', text: 'Returned to headquarters from the Ridgeway reconnaissance.' },
      { time: '8:30 PM', text: 'Filed the reconnaissance summary.' },
      { time: '9:15 PM', text: 'Mess. Ate with the night shift.' },
      { time: '10:15 PM', text: 'Met Pendelton for a mission debriefing.' },
      { time: '11:05 PM', text: 'Gym, lower level.' },
      { time: '11:50 PM', text: 'Prepared the patrol route: north gate, west perimeter, storage road, east fence.' },
      { time: '12:30 AM', text: 'Radio check with security control.' },
      { time: '1:30 AM', text: 'Departed on security patrol.' },
      { time: '1:40 AM', text: 'North gate, clear.' },
      { time: '2:00–2:30 AM', text: 'Vehicle GPS places him outside the safehouse, west perimeter.' },
      { time: '2:50 AM', text: 'East fence, clear.' },
      { time: '3:10 AM', text: 'Returned, logged mileage.' },
      { time: '3:30 AM', text: 'Radio R-14 returned to armoury.' },
      { time: '3:45 AM', text: 'Patrol report filed.' },
    ],
  },
  {
    id: 'S30-005',
    name: 'Celeste Rowan',
    position: 'Diplomatic Liaison',
    notes:
      "Celeste manages Section 30's international intelligence partnerships. Fluent in six languages, she is known for her diplomatic charm and extensive network of contacts. She frequently exchanges handwritten correspondence and keeps a personalized stationery set in her office.",
    log: [
      { time: '6:00 PM', text: 'Attended the executive briefing.' },
      { time: '6:50 PM', text: 'Office. Replied to three partner services by letter.' },
      { time: '7:40 PM', text: 'Call with the Lisbon desk. Scheduling.' },
      { time: '8:30 PM', text: "Prepared the brief for tomorrow's liaison meeting." },
      { time: '9:20 PM', text: 'Mess, briefly.' },
      { time: '10:30 PM', text: 'Met privately with Pendelton. Partner matters.' },
      { time: '11:15 PM', text: 'Office. Sealed the diplomatic pouch for the morning courier.' },
      { time: '11:50 PM', text: 'Changed for the evening meeting.' },
      { time: '12:45 AM', text: 'Left for a diplomatic meeting.' },
      { time: '1:15 AM', text: 'Driver. Across town.' },
      { time: '2:00–2:30 AM', text: 'Attending a meeting across town. Routine intelligence briefing.' },
      { time: '2:45 AM', text: 'Meeting over. Driver took me home.' },
      { time: '3:30 AM', text: 'Home.' },
    ],
  },
];

export const LAYER_02_HEADER = {
  title: 'S30 LEDGER // LAYER 02',
  subtitle: 'CLASSIFIED // MAGENTA CHANNEL // RECOVERED SURVEILLANCE & EVIDENCE RECORDS // STATUS: DECRYPTED',
  intro:
    "The following records were recovered from Section 30's internal surveillance network: badge, camera, terminal, radio and vehicle events, with the belongings confiscated from each agent at headquarters. Some information may contradict previously submitted activity logs.",
};

export const INCIDENT = {
  incident: 'Murder of Arthur Pendelton',
  timeOfDeath: '2:14 AM',
  location: "Director's Office, secure safehouse",
  found: '4:15 AM, by duty officer Hale on the hourly round',
};

/** Layer 02 events that belong to no agent: the duty officer's rounds and the discovery. Searchable like the rest. */
export const FACILITY_LOG: LogLine[] = [
  { time: '11:02 PM', text: 'Duty officer Hale: hourly round, safehouse inner door. Clear.' },
  { time: '12:04 AM', text: 'Duty officer Hale: hourly round, safehouse inner door. Clear.' },
  { time: '1:01 AM', text: 'Duty officer Hale: hourly round, safehouse inner door. Clear.' },
  { time: '2:03 AM', text: 'Duty officer Hale: hourly round, safehouse inner door. Clear.' },
  { time: '3:02 AM', text: 'Duty officer Hale: hourly round, safehouse inner door. Clear.' },
  { time: '4:15 AM', text: "Duty officer Hale: hourly round. Director's Office door open. Director found unresponsive. Security called." },
];

export const LAYER_02: LedgerEntry[] = [
  {
    id: 'S30-001',
    name: 'Mara Voss',
    position: 'Security Director',
    log: [
      { time: '6:02 PM', text: 'Badge: security control room, in.' },
      { time: '6:31 PM', text: "Badge: Director's Office, in. Out 7:04 PM." },
      { time: '7:12 PM', text: 'Badge: safehouse inner door, in. Out 7:40 PM.' },
      { time: '9:08 PM', text: 'Badge: mess, in.' },
      { time: '9:47 PM', text: 'Armoury count countersigned. R-14 out to S30-004 since 6:41 PM.' },
      { time: '10:46 PM', text: 'Control room terminal: camera 7 diagnostic run. Fault logged.' },
      { time: '11:32 PM', text: 'Maintenance window MW-2291 approved, requester S30-002.' },
      { time: '12:03 AM', text: 'Badge: north gate pedestrian door, out. In 12:26 AM.' },
      { time: '12:31 AM', text: 'Radio: check-in with unit 2 (S30-004), channel 3.' },
      { time: '1:04 AM', text: "Badge: Security Director's office, in." },
      { time: '1:50 AM', text: 'Badge: security control room, in.' },
      { time: '2:08 AM', text: 'Logged into surveillance terminal.' },
      { time: '2:09 AM', text: 'Personnel database: restricted file PF-0412 opened. Clearance override used.' },
      { time: '2:14 AM', text: 'Surveillance system recorded active monitoring, cameras 6 to 9.' },
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
      { time: '6:18 PM', text: 'Badge: main entrance, in.' },
      { time: '7:14 PM', text: 'Badge: server room, in.' },
      { time: '7:31 PM', text: 'Rack 3, bay 6: drive removed. 7:36 PM: drive inserted.' },
      { time: '8:41 PM', text: 'Array rebuild started, estimated 2 h 50 m.' },
      { time: '10:22 PM', text: 'Document created: Archive Indexer Upgrade Proposal.' },
      { time: '11:28 PM', text: "Badge: Director's Office, in. Out 11:52 PM." },
      { time: '12:09 AM', text: 'Badge: server room, in. Out 12:14 AM.' },
      { time: '12:41 AM', text: 'Badge: main entrance, out. Motor pool gate: personal vehicle out 12:44 AM.' },
      { time: '12:58 AM', text: 'Home router: workstation online.' },
      { time: '1:40 AM', text: 'Remote session opened to archive node cluster.' },
      { time: '1:52 AM', text: 'Patch set AR-114 applied to node 1.' },
      { time: '2:06 AM', text: 'Authenticated remote connection from residence (re-auth on token expiry).' },
      { time: '2:14 AM', text: 'Active remote maintenance session, node 3 patching.' },
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
      { time: '6:14 PM', text: 'Badge: analysis wing, in.' },
      { time: '7:02 PM', text: 'Decrypt terminal: batch DQ-771 opened. Closed 7:48 PM.' },
      { time: '8:03 PM', text: 'Classified files reading room: 4 files signed out. Returned 8:55 PM.' },
      { time: '8:58 PM', text: 'Badge: mess, in.' },
      { time: '9:41 PM', text: 'Decrypt terminal: batch DQ-772 opened. Closed 10:20 PM.' },
      { time: '10:31 PM', text: 'Badge: archives B1, in. 3 files signed out. Out 10:49 PM.' },
      { time: '11:18 PM', text: "Badge: Director's Office, in. Out 11:57 PM." },
      { time: '12:02 AM', text: 'Badge: analysis wing, in.' },
      { time: '12:51 AM', text: 'Decrypt terminal: batch DQ-773 opened. Flag raised on message 14. Closed 1:26 AM.' },
      { time: '1:31 AM', text: 'Badge: archives B1, in. 3 files returned. Out 1:49 AM.' },
      { time: '1:55 AM', text: 'Camera 3: seen approaching the safehouse inner door.' },
      { time: '2:11 AM', text: "Badge: Director's Office, in." },
      { time: '2:14 AM', text: 'Camera 3: inner corridor empty.' },
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
      { time: '6:08 PM', text: 'Motor pool: unit 2 checked out.' },
      { time: '6:41 PM', text: 'Armoury log: R-14 issued to S30-004.' },
      { time: '7:44 PM', text: 'Motor pool: unit 2 in. Mileage 61.' },
      { time: '8:33 PM', text: 'Document created: Reconnaissance Summary, Ridgeway.' },
      { time: '9:12 PM', text: 'Badge: mess, in.' },
      { time: '10:14 PM', text: "Badge: Director's Office, in. Out 10:58 PM." },
      { time: '11:06 PM', text: 'Badge: lower level gym, in. Out 11:47 PM.' },
      { time: '12:31 AM', text: 'Radio: check-in with security control, channel 3.' },
      { time: '1:30 AM', text: 'Departed headquarters in patrol vehicle.' },
      { time: '1:39 AM', text: 'GPS: north gate.' },
      { time: '1:47 AM', text: 'GPS: stopped, restricted equipment storage facility. Stationary 8 min.' },
      { time: '1:56 AM', text: 'GPS: storage road, moving.' },
      { time: '2:05 AM', text: 'GPS: safehouse west perimeter road. Vehicle stationary.' },
      { time: '2:14 AM', text: 'Body camera recorded an active perimeter inspection, west fence.' },
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
      { time: '5:58 PM', text: 'Badge: briefing room, in. Out 6:44 PM.' },
      { time: '6:52 PM', text: 'Badge: liaison office, in.' },
      { time: '7:41 PM', text: 'Secure line: outbound, Lisbon, 22 min.' },
      { time: '9:18 PM', text: 'Badge: mess, in. Out 9:31 PM.' },
      { time: '10:29 PM', text: "Badge: Director's Office, in. Out 11:08 PM." },
      { time: '11:16 PM', text: 'Diplomatic pouch log: pouch DP-3310 sealed, courier 7:00 AM.' },
      { time: '11:52 PM', text: 'Badge: liaison office, out. Residence wing.' },
      { time: '12:45 AM', text: 'Departed headquarters. Motor pool: car 1 with driver.' },
      { time: '1:03 AM', text: 'Car 1 GPS: city centre.' },
      { time: '1:58 AM', text: 'Arrived at diplomatic residence.' },
      { time: '2:14 AM', text: 'Security cameras recorded her attending a meeting, residence reception room.' },
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
export const LEDGER_FRAGMENTS: Record<string, string> = {
  'section 30':
    'Created thirty years ago to identify, contain and neutralize the most dangerous cyber threats. No public mandate, no official oversight. Authorizing names sealed.',
  ledger:
    'S30 Ledger: master index of every operative, analyst and contractor ever recruited. Classified dossiers, operational logs, secrets worth killing for. Maintained by Director Pendelton.',
  'hard copy': 'One hard copy of the S30 Ledger exists. Pendelton learned it was to be sold to an international syndicate. Its present location is not on record.',
  pendelton:
    'Arthur Pendelton. Director. Found at 04:15 in the Director’s Office inside the secure safehouse. With his last act he locked the system down and activated the emergency failsafe recovery protocol. His final dispatch named Detective Jimmy.',
  failsafe:
    'Emergency failsafe recovery protocol: scatters the recovery chain across physical and digital drops so no single insider can purge it. Layer 01 opens on recovery. Layer 02 needs a second authorisation.',
  syndicate:
    'Open file: an international syndicate has approached Section 30 personnel seeking the Ledger. The buyer wanted a hard copy and the digital archives purged. Known intermediary contact string on file.',
  jimmy: 'Detective Jimmy. Left the force ten years ago. Recovery authority granted by the Director’s final dispatch. Clearance: everything that survived.',
  'layer 02': 'Layer 02: recovered surveillance and evidence records, sealed until a second recovery authorisation arrives.',
  compound:
    'Headquarters compound: main building (ops floor, analysis wing, archives on B1, server room, security control room, armoury, mess, gym on the lower level); the secure safehouse in the inner compound with the Director’s Office; the perimeter (north gate, west perimeter road, restricted equipment storage facility on the storage road, east fence); the motor pool.',
};

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

/** Parses "2:14", "2:14 AM", "02:14", "14:30" as the ARCHIVE's window bounds. Bare hours 0 to 11 are taken as AM, 12 to 23 as PM. */
export function parseWindow(s?: string): number | null {
  if (!s) return null;
  const t = s.trim().replace(/^(\d{1,2})\s*(AM|PM)$/i, '$1:00 $2');
  if (/AM|PM/i.test(t)) return ledgerMinutes(t);
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2] ?? '0');
  if (h > 23) return null;
  return ledgerMinutes(`${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`);
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
  /** Agent id, or FACILITY for the duty log. */
  who: string;
  name: string;
  time: string;
  text: string;
}

/** Search the open layers by agent, time window and free text. `place` and `keyword` both match the line text, case-insensitively. */
export function searchLedger(opts: { who?: string; from?: string; to?: string; text?: string; layers: { 1: boolean; 2: boolean } }): SearchHit[] {
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
  if (opts.layers[1]) for (const e of findEntries(LAYER_01, opts.who)) for (const l of e.log) if (inWindow(l.time) && matches(l.text, l.time)) hits.push({ layer: 1, who: e.id, name: e.name, time: l.time, text: l.text });
  if (opts.layers[2]) {
    for (const e of findEntries(LAYER_02, opts.who)) for (const l of e.log) if (inWindow(l.time) && matches(l.text, l.time)) hits.push({ layer: 2, who: e.id, name: e.name, time: l.time, text: l.text });
    if (!opts.who || /hale|duty|facility/i.test(opts.who)) for (const l of FACILITY_LOG) if (inWindow(l.time) && matches(l.text, l.time)) hits.push({ layer: 2, who: 'FACILITY', name: 'Duty log', time: l.time, text: l.text });
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
  const log = e.log.map((l) => `${l.time} ${l.text}`).join('\n');
  if (layer === 1) return `${head}\nProfile: ${e.notes}\nSelf-reported activity:\n${log}`;
  return `${head}\nRecorded activity:\n${log}\nRecovered evidence: ${(e.evidence ?? []).join('; ')}\nAdditional findings: ${e.notes}`;
}
