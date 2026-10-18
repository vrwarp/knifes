import { DEFAULT_WORD_BANK } from './content/words.js';
import type { GameConfig } from './types.js';

export const DEDUCTION_TEMPLATE =
  'At [TIME], [SUSPECT] poisoned Director Pendelton using [METHOD] to exfiltrate [ASSET] because [MOTIVE], and concealed Drive 30-ALPHA inside [PHYSICAL PROP].';

export const DEFAULT_CONFIG: GameConfig = {
  version: 1,
  title: "Section 30: The Director's Last File",
  intro: {
    headline: 'SECTION 30 // MAGENTA CHANNEL',
    body: `RECOVERY PROTOCOL 30-A ENGAGED.

Detective Jimmy. Authentication accepted.

Director Pendelton's final lockdown scattered the evidence across an emergency recovery chain. This terminal is the first link.

The primary mainframe is wiped. Drive 30-ALPHA is missing. What survives is fragmented, and someone inside the division wants it to stay that way.

Follow the chain. Do not announce your investigation. Trust no one.`,
    buttonLabel: 'INITIATE RECOVERY PROTOCOL',
  },
  geo: {
    mode: 'puzzle',
    briefing:
      "Pendelton's last outbound transmission carried a live feed from a field contact's camera. Look around, work out where the feed is coming from, and drop a marker on the map. The next link in the chain is waiting there.",
    target: null,
    radiusMeters: 200,
    mapCenter: { lat: 34.0522, lng: -118.2437 },
    mapZoom: 11,
    photos: [],
    streetView: { location: null, heading: 0, pitch: 0, allowMoving: true },
    revealTitle: 'LOCATION CONFIRMED',
    revealBody:
      'Field contact drop point confirmed. Proceed to the location now. Look for Section 30 markings. Further instructions are waiting on site.',
  },
  gate: {
    prompt:
      'The drop-point instructions carry a number. Call it. Whoever answers holds the recovery key. Enter it here.',
    code: 'MAGENTA30',
    successText: 'Recovery key accepted. Mirror partition 30-BETA located. Encryption active.',
  },
  hack: {
    mode: 'race',
    secret: 'LANTERN',
    maxAttempts: null,
    lockoutSeconds: 45,
    intro:
      'Seven-character key. Green placed, amber misplaced, dim absent.',
    wordBank: DEFAULT_WORD_BANK,
    aiStyle: 'scripted',
    aiModel: 'claude-sonnet-5-5',
    aiPlanGuesses: 8,
    aiPlanJitter: 2,
    aiIntervalSeconds: 10,
    aiJitterSeconds: 5,
    aiSlowdownPerRound: 1.5,
    aiShowLetters: true,
    aiThinking: true,
    freePass: {
      enabled: true,
      text: 'ADVERSARY PROCESS OVERHEATED. PARTITION FAILSAFE TRIGGERED. KEY RELEASED TO OPERATOR.',
    },
  },
  reveal: {
    title: 'PARTITION DECRYPTED // INCIDENT RECORD 30-0415',
    body: `INCIDENT: Director Arthur Pendelton. Secure safehouse, Director's office, inner wing.

TIME OF DEATH: 04:15.

CAUSE: Synthetic neurotoxin, delayed onset. Preliminary toxicology indicates ingestion approximately thirty minutes prior.

The office door logged three badge entries between 03:30 and 04:00. The full access log, the ambient intercept and the operative manifest are held in the ARCHIVE, which this terminal can now reach.

DIRECTIVE: Return to base. Every operative with inner-circle clearance has been recalled to your location for debrief. They are gathering now. Among them is the one who sold us.

Interrogate them. Cross-reference the ARCHIVE. Find Drive 30-ALPHA.

Recovery chain complete. The rest is detective work.`,
    buttonLabel: 'RETURN TO BASE',
  },
  evidence: {
    gateMode: 'after_hack',
    passcodes: { audio: 'CANIS30', toxicology: '1996' },
    audioUploadId: null,
    audioNotes:
      "Ambient intercept, Director's office, 03:44:50 to 03:47:10. Waveform notes: heavy metallic vessel set down at 0:12. Paper rustle, envelope-weight, at 0:29. Liquid poured at 0:31. Perimeter alarm tone over a handheld radio at 0:38. Door at 0:41. Door at 1:50.",
  },
  archive: {
    enabled: true,
    maxMessageChars: 400,
    welcome:
      'ARCHIVE ONLINE. Partition integrity degraded. I hold what survived the wipe: the access log, the manifest, the toxicology desk, the intercept notes, fragments of the Ledger index. Ask. I answer what the records support. I do not guess.',
  },
  deduction: {
    prompt: 'Complete the master deduction. Every field must verify against the ARCHIVE.',
    template: DEDUCTION_TEMPLATE,
    slots: [
      {
        id: 'time',
        label: 'TIME',
        placeholder: 'e.g. 02:10 AM',
        canonical: '03:45 AM',
        accept: ['03:45', '3:45', '345', '3.45', 'quarter to four', 'quarter to 4', 'three forty five', 'three forty-five'],
        reject: ['04:15', '4:15', '03:42', '3:42', '03:30', '3:30'],
        guidance: 'Any phrasing of 3:45 in the morning passes. 4:15 is the time of death and fails. 3:42 and 3:30 are badge times and fail.',
      },
      {
        id: 'suspect',
        label: 'SUSPECT',
        placeholder: 'Agent codename',
        canonical: 'Agent Vector',
        accept: ['vector'],
        reject: ['cipher', 'sentinel', 'ledger', 'echo', 'horizon', 'trace', 'apex'],
        guidance: 'Must identify Agent Vector, the cyber threat analyst, badge S30-404. Any other operative fails.',
      },
      {
        id: 'method',
        label: 'METHOD',
        placeholder: 'how it was done',
        canonical: 'a neurotoxin in his Earl Grey tea',
        accept: ['poison', 'tea', 'neurotoxin', 'toxin', 'earl grey', 'nightshade', 'poisoned cup', 'poisoned drink', 'spiked'],
        reject: ['letter opener', 'stab', 'knife', 'shot', 'gun', 'strangle', 'choke'],
        guidance: 'Poisoned tea, a neurotoxin, or simply poison in any wording passes. The letter opener was a red herring and fails, as does any violent method.',
      },
      {
        id: 'asset',
        label: 'ASSET',
        placeholder: 'what they were after',
        canonical: 'the Section 30 Ledger on Drive 30-ALPHA',
        accept: ['ledger', 'drive 30-alpha', '30-alpha', 'alpha', 'the drive', 'flash drive', 'usb', 'master index', 'dossiers'],
        reject: [],
        guidance: 'The Ledger, the master index, the dossiers, or Drive 30-ALPHA all pass.',
      },
      {
        id: 'motive',
        label: 'MOTIVE',
        placeholder: 'they wanted to…',
        canonical: 'to sell it to an international syndicate',
        accept: ['sell', 'sale', 'syndicate', 'money', 'buyer', 'profit', 'cash', 'paid', 'rich', 'payout', 'payday'],
        reject: ['revenge', 'love', 'accident'],
        guidance: 'Selling the Ledger to a syndicate or any buyer, or doing it for money, passes. Revenge or an accident fails.',
      },
      {
        id: 'prop',
        label: 'PHYSICAL PROP',
        placeholder: 'where the drive is now',
        canonical: 'the birthday card envelope on the gift table',
        accept: ['birthday card', 'card', 'envelope', 'gift table', 'lining'],
        reject: ['book', 'water bottle', 'bottle', 'tea tin', 'tumbler', 'notebook', 'planner', 'folder', 'lanyard', 'flashlight', 'headphones', 'cassette'],
        guidance: 'The birthday card or its envelope passes. Any other guest prop fails.',
      },
    ],
    successTitle: 'DEDUCTION VERIFIED',
    successBody: `Access log, intercept and toxicology converge on one operative. Agent Vector. Badge S30-404. Inner-circle clearance revoked.

Drive 30-ALPHA is concealed in the lining of the birthday card envelope on the gift table. Recover it now.

Pendelton wrote: you are the last decision. He was right. Section 30 opened its first file in 1996. So did you.

Case 30-0415 closed. Happy thirtieth, Detective.`,
    failText:
      'DEDUCTION REJECTED. Somewhere in this room, someone just breathed out. Re-examine the evidence and resubmit.',
    maxAttempts: null,
    feedback: 'pass_fail',
  },
  hints: {
    quick: {
      geo: ['Turn towards the shopfronts. One of the signs carries a street name.'],
      gate: ['The remote asset is expecting your call. Use the number on the drop-point card.'],
      hack: [
        'The partition key is a seven-letter designation. Field-craft vocabulary is worth a try.',
        'Spend the first two attempts on vowels and the common consonants, then narrow.',
      ],
      investigation: [
        'The toxin needs thirty minutes. Count back from the time of death, then ask the ARCHIVE who was in the office at that minute.',
        "The intercept has a paper rustle right before the pour. Ask the ARCHIVE what the property check at the inner-wing door logged.",
      ],
      solved: [],
    },
  },
};
