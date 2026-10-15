// Evidence held in the Section 30 ARCHIVE. Everything here is "public" in-world data
// that the player and the ARCHIVE agent may see. Character secrets are deliberately absent.

export interface AccessLogRow {
  time: string;
  badge: string;
  name: string;
  door: string;
  event: string;
}

export const ACCESS_LOG: AccessLogRow[] = [
  { time: '03:02', badge: 'S30-808', name: 'Agent Apex', door: 'Inner-wing corridor', event: 'Guard post check-in' },
  { time: '03:11', badge: 'S30-606', name: 'Agent Horizon', door: 'Basement archive door', event: 'Entry' },
  { time: '03:14', badge: 'S30-606', name: 'Agent Horizon', door: 'Archive terminal T-4', event: 'Login: personnel files, 1996 series' },
  { time: '03:28', badge: 'S30-202', name: 'Agent Ledger', door: 'Inner-wing door', event: 'Entry' },
  { time: '03:30', badge: 'S30-202', name: 'Agent Ledger', door: "Director's office door", event: 'Entry' },
  { time: '03:34', badge: 'S30-404', name: 'Agent Vector', door: 'Breakroom door', event: 'Entry' },
  { time: '03:35', badge: 'S30-202', name: 'Agent Ledger', door: "Director's office door", event: 'Exit' },
  { time: '03:36', badge: 'S30-202', name: 'Agent Ledger', door: 'Inner-wing door', event: 'Exit' },
  { time: '03:39', badge: 'S30-404', name: 'Agent Vector', door: 'Breakroom door', event: 'Exit' },
  { time: '03:40', badge: 'S30-101', name: 'Agent Cipher', door: 'Breakroom door', event: 'Entry' },
  { time: '03:40', badge: 'S30-505', name: 'Agent Echo', door: 'Breakroom door', event: 'Entry' },
  { time: '03:40', badge: 'S30-808', name: 'Agent Apex', door: 'Exterior door (east)', event: 'Exit. Guard post vacant' },
  { time: '03:42', badge: 'S30-404', name: 'Agent Vector', door: "Director's office door", event: 'Entry' },
  { time: '03:44', badge: 'S30-303', name: 'Agent Sentinel', door: "Director's office door", event: 'Entry' },
  { time: '03:45', badge: 'SYSTEM', name: 'Perimeter sensor 7', door: 'North fence', event: 'Alarm. Broadcast on security radio channel' },
  { time: '03:45', badge: 'S30-606', name: 'Agent Horizon', door: 'Archive terminal T-4', event: 'Keystroke activity ends' },
  { time: '03:45', badge: 'S30-303', name: 'Agent Sentinel', door: "Director's office door", event: 'Exit' },
  { time: '03:46', badge: 'S30-303', name: 'Agent Sentinel', door: 'Exterior door (north)', event: 'Exit. Responding to perimeter alarm' },
  { time: '03:46', badge: 'S30-606', name: 'Agent Horizon', door: 'Archive terminal T-4', event: 'Auto-lock (idle)' },
  { time: '03:47', badge: 'S30-404', name: 'Agent Vector', door: "Director's office door", event: 'Exit' },
  { time: '03:48', badge: 'S30-404', name: 'Agent Vector', door: 'Inner-wing door', event: 'Exit. Property check: diagnostic folder, one card envelope (personal)' },
  { time: '03:50', badge: 'S30-101', name: 'Agent Cipher', door: 'Breakroom door', event: 'Exit' },
  { time: '03:50', badge: 'S30-505', name: 'Agent Echo', door: 'Breakroom door', event: 'Exit' },
  { time: '03:51', badge: 'S30-808', name: 'Agent Apex', door: 'Exterior door (east)', event: 'Entry. Guard post resumed' },
  { time: '03:58', badge: 'S30-303', name: 'Agent Sentinel', door: 'Exterior door (north)', event: 'Entry' },
  { time: '04:09', badge: 'SYSTEM', name: 'Director credentials', door: 'Mainframe console', event: 'Lockdown. Mainframe wipe. Drive 30-ALPHA ejected. Courier dispatch queued' },
  { time: '04:12', badge: 'S30-707', name: 'Agent Trace', door: 'Inner-wing door', event: 'Entry' },
  { time: '04:15', badge: 'S30-707', name: 'Agent Trace', door: "Director's office door", event: 'Entry. Director found unresponsive' },
  { time: '04:16', badge: 'S30-808', name: 'Agent Apex', door: "Director's office door", event: 'Entry' },
  { time: '04:30', badge: 'SYSTEM', name: 'Log export', door: '', event: 'End of recovered segment' },
];

export const CAMERA_NOTES: string[] = [
  'Exterior camera E-2 (east fence): 03:41 to 03:50, S30-808 Apex crouched at the fence line feeding a small animal. Canine, juvenile. Returned inside 03:51.',
  'Exterior camera N-1 (north perimeter): 03:46 to 03:57, S30-303 Sentinel sweeping the fence with a flashlight after the sensor 7 alarm. No intruder found.',
  'Breakroom camera B-1: offline since 02:50. Maintenance ticket open.',
  "Director's office: no camera. Audio pickup only (see Ambient Intercept).",
];

export const TOXICOLOGY_REPORT = `# PRELIMINARY TOXICOLOGY AND SCENE REPORT
Case 30-0415. Subject: Arthur Pendelton, Director. Examiner: Section 30 forensic desk (Agent Trace, preliminary).

## Findings
- Agent: synthetic neurotoxin, designation S30-TX "Nightshade-7". Fast-acting paralytic, delayed onset.
- Onset: paralysis begins 30 minutes after ingestion, plus or minus two minutes. Death follows within seconds of full onset.
- Route: ingestion. Residue detected in the desk cup. Beverage: Earl Grey tea, bergamot, with honey.
- No injection sites. No wounds. No defensive marks.
- Time of death: 04:15, confirmed by the office audio pickup and badge log.

## Scene inventory (Director's desk)
- One ceramic cup, two thirds consumed. Residue positive for Nightshade-7.
- One brass letter opener, Section 30 crest. No blood, no tissue, no toxin. Fingerprints: the Director only. Not a weapon.
- One diagnostic report folder, night-shift series, timestamped 03:40.
- One tea tin, specialty Earl Grey, gifted. Tin residue positive for Nightshade-7. The tin was normally kept in the breakroom.
- Drive 30-ALPHA: dock empty. Drive ejected by the Director's lockdown at 04:09 and not recovered on site.

## Examiner's note
Work backward from the time of death. Thirty minutes. Whoever handed the Director that cup did it at 03:45, give or take two minutes. The breakroom tin was the source, so the cup was dosed before it reached the office or at the desk itself.
`;

export interface Dossier {
  codename: string;
  badge: string;
  role: string;
  clearance: string;
  relationship: string;
  publicNotes: string;
}

export const MANIFEST: Dossier[] = [
  {
    codename: 'Agent Cipher',
    badge: 'S30-101',
    role: 'Cryptographer',
    clearance: 'Inner circle',
    relationship: "Pendelton's protégé. Designed the Ledger's encryption.",
    publicNotes: 'Gifted the Director a tin of specialty Earl Grey last week. Known tea enthusiast. Carries a reusable tumbler everywhere.',
  },
  {
    codename: 'Agent Ledger',
    badge: 'S30-202',
    role: 'Financial auditor',
    clearance: 'Inner circle',
    relationship: 'Audited Section 30 operational funds for nine years. Recently flagged a shortfall.',
    publicNotes: 'Raised voices heard from the Director\'s office around 03:30. Carries an executive planner stuffed with financial notes.',
  },
  {
    codename: 'Agent Sentinel',
    badge: 'S30-303',
    role: 'Head of security',
    clearance: 'Inner circle',
    relationship: 'Ran the safehouse perimeter for twelve years. Blames outside hackers for every breach.',
    publicNotes: 'Never without a heavy stainless steel water bottle. Sets it down hard enough to dent tables.',
  },
  {
    codename: 'Agent Vector',
    badge: 'S30-404',
    role: 'Cyber threat analyst',
    clearance: 'Inner circle',
    relationship: 'Night-shift lead. Delivers the overnight diagnostic report to the Director personally.',
    publicNotes: 'Helpful with technical questions. Property check at 03:48 logged a diagnostic folder and one card envelope, described as personal.',
  },
  {
    codename: 'Agent Echo',
    badge: 'S30-505',
    role: 'Communications specialist',
    clearance: 'Inner circle',
    relationship: 'Monitors all Section 30 channels. Talks more than anyone in the division.',
    publicNotes: 'Wears over-ear headphones constantly. Was in the breakroom making coffee during the window of interest.',
  },
  {
    codename: 'Agent Horizon',
    badge: 'S30-606',
    role: 'Archives curator',
    clearance: 'Inner circle',
    relationship: 'Keeper of the physical and digital archive since the 1996 founding.',
    publicNotes: 'Logged into the 1996 personnel files around the time of the murder. Nostalgic about retro tech. Carries a cassette recorder.',
  },
  {
    codename: 'Agent Trace',
    badge: 'S30-707',
    role: 'Forensics officer',
    clearance: 'Inner circle',
    relationship: 'Found the body. Wrote the preliminary report.',
    publicNotes: 'Protective of a leather pocket notebook since the incident. Writes constantly.',
  },
  {
    codename: 'Agent Apex',
    badge: 'S30-808',
    role: 'Tactical escort',
    clearance: 'Inner circle',
    relationship: "The Director's door guard on nights.",
    publicNotes: 'Left the guard post outside the Director\'s door at 03:40 without logging a reason. Carries a tactical flashlight.',
  },
];

export const PENDELTON_NOTE = `To whoever the courier reaches first,

Someone I trusted is purging the archive tonight and the Ledger goes to a buyer by morning. I have locked the system and ejected ALPHA. The wipe is running. I cannot feel my hands.

The tea was a gift. It was a kindness. I thought it was a kindness.

Jimmy. Thirty years of deciding whom to trust. You are the last decision.

A.P.`;

export const LEDGER_FRAGMENTS: Record<string, string> = {
  'section 30': 'Founded 1996. Off-the-books counter-cyberintelligence cell. No public mandate. Authorizing signatures sealed.',
  ledger: 'S30 Ledger: master index of every operative, analyst and contractor recruited since 1996. Dossiers, operational logs, leverage files. Unencrypted master copy held on Drive 30-ALPHA. Mirror partition held on Drive 30-BETA.',
  alpha: 'Drive 30-ALPHA: heavy alloy flash drive. Unencrypted Ledger master. Ejected 04:09 by Director lockdown. Current location unknown.',
  beta: 'Drive 30-BETA: mirror partition. Encrypted. Field kit copy.',
  pendelton: 'Arthur Pendelton. Director since 1996. Deceased 04:15. Final credentials used at 04:09: lockdown, wipe, eject, courier dispatch.',
  nightshade: 'S30-TX "Nightshade-7": synthetic neurotoxin. Thirty minute onset. Section 30 custody record: one vial, signed out of the lab safe. Sign-out record lost in the wipe.',
  syndicate: 'Open file: an international syndicate has made three approaches to Section 30 personnel in the last year seeking the Ledger. Offer reportedly exceeds eight figures.',
  courier: 'Emergency courier dispatch: sealed envelope, black wax, hand delivery to Detective Jimmy. Dispatched by the Director at 04:09.',
};
