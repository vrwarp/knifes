import { DEFAULT_WORD_BANK } from './content/words.js';
import type { GameConfig } from './types.js';

export const DEDUCTION_TEMPLATE =
  'At [TIME], [SUSPECT] killed Director Pendelton with [METHOD] to take [ASSET] because [MOTIVE], and hid it in [PHYSICAL PROP].';

/** The prop slot ships unset: the GMs decide where the hard copy is hidden at the party. The readiness check flags this. */
export const PROP_PLACEHOLDER = '[GM: SET THE HIDING PLACE]';

export const PHIL_PART_1 = `PHIL: Identify yourself.
JIMMY: Who watches the watchers?
PHIL: Section Thirty.

(Brief pause.)

PHIL: Detective Jimmy. Good, you've made contact. We've managed to gather all five Section 30 agents at headquarters. They're being held there while we investigate Pendelton's murder. We believe one of them is responsible, but we don't have enough evidence to determine who.

That's where you come in.

Pendelton left behind the digital S30 Ledger containing classified personnel records and activity logs that could help identify the killer. Unfortunately, he locked the system behind an emergency security protocol before his death. I'm transmitting your recovery authorization code now.

S30GHOST

Enter that code into the website's recovery terminal. It'll initiate a hacking sequence you'll need to complete to bypass the Ledger's security. Once you've successfully accessed the Ledger, review the agents' files carefully. Then return to headquarters. The suspects will be waiting for you there.

You'll need to piece everything together and determine who murdered Pendelton. Remember, Detective. Everyone has secrets. But only one of them is a killer. Good luck, Jimmy. Section Thirty is counting on you.`;

export const PHIL_PART_2 = `PHIL: Jimmy... it's Phil. We've got a breakthrough. Our team managed to crack another layer of Pendelton's encryption. Turns out, the Ledger you accessed earlier was only a partial archive.

The original personnel files contained the agents' self-reported activity logs. But Pendelton kept a separate set of records that automatically tracked their actual movements using an advanced biometric tracker. We've managed to recover those records. Additionally, we finished processing their inventory of personal belongings confiscated from each agent when they were brought into headquarters.

And Jimmy... there are some discrepancies. At least one of the agents wasn't where they claimed to be on the night of the murder. I've uploaded the recovered information to your Ledger. You should have access to a new section labeled CLASSIFIED EVIDENCE. Compare the recovered timestamps against what the agents told you during their interrogations. I think we're getting close.

(GM: press Release Layer 02 now, or read him the passcode.)

Good luck, Detective.`;

export const DEFAULT_CONFIG: GameConfig = {
  version: 1,
  title: "Section 30: The Director's Last File",
  intro: {
    headline: 'SECTION 30 // MAGENTA CHANNEL',
    body: `EMERGENCY FAILSAFE RECOVERY PROTOCOL ENGAGED.

Detective Jimmy. Authentication accepted.

Director Pendelton's last act scattered the recovery chain across physical and digital drops so that no one inside the division could purge it. This terminal is the first digital link.

The S30 Ledger survives, locked. Someone in the inner circle wanted it sold and the archives wiped. They do not yet know the failsafe fired.

Follow the chain. Do not announce your investigation. Trust no one.`,
    buttonLabel: 'INITIATE RECOVERY PROTOCOL',
  },
  geo: {
    mode: 'puzzle',
    briefing:
      "The failsafe's first physical drop was placed by a field contact near Lake Elizabeth. His camera feed is the only record of the spot. Look around, work out where the feed is coming from, and drop a marker on the map. The coordinates follow.",
    target: null,
    radiusMeters: 200,
    mapCenter: { lat: 34.66, lng: -118.41 },
    mapZoom: 13,
    photos: [],
    streetView: { location: null, heading: 0, pitch: 0, allowMoving: true },
    revealTitle: 'LOCATION CONFIRMED',
    revealBody:
      'Drop point confirmed. Proceed to the location now. Look for Section 30 markings. A note is waiting on site with your next instruction.',
  },
  gate: {
    prompt:
      'The note tells you to call your old code breaker and give him the phrase. Whoever answers holds the recovery authorization code. Enter it here.',
    code: 'S30GHOST',
    successText: 'Recovery authorization accepted. Ledger security located. Initiating hacking sequence.',
  },
  hack: {
    mode: 'race',
    secret: 'LANTERN',
    maxAttempts: null,
    lockoutSeconds: 45,
    intro: 'Seven-character key. Green placed, amber misplaced, dim absent.',
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
      text: 'ADVERSARY PROCESS OVERHEATED. LEDGER FAILSAFE TRIGGERED. KEY RELEASED TO OPERATOR.',
    },
  },
  reveal: {
    title: 'LEDGER DECRYPTED // LAYER 01 RELEASED',
    body: `S30 LEDGER. ACCESS LEVEL: MAGENTA.

Layer 01 is open: the classified personnel records of the five Section 30 agents now held at headquarters, with the activity each of them reported for the night Director Pendelton died.

Pendelton was found at 04:15 in the Director's Office inside the secure safehouse. The killer is one of the five.

DIRECTIVE: Return to headquarters. Question each agent. Establish where every one of them was between 11:00 PM and 4:00 AM, and hold their answers against the Ledger.

Recovery chain complete. The rest is detective work.`,
    buttonLabel: 'RETURN TO HEADQUARTERS',
  },
  ledger: {
    layer2Passcode: 'MAGENTA30',
    layer2Label: 'CLASSIFIED EVIDENCE',
    layer2ReleasedText:
      'SECOND AUTHORIZATION RECEIVED. Ledger Layer 02 decrypted: recovered surveillance records and confiscated belongings for all five agents. A new section, CLASSIFIED EVIDENCE, is open in your Ledger. Compare the recovered timestamps against what they told you.',
    interrogationWindow: '11:00 PM to 4:00 AM',
  },
  phil: {
    challenge: 'Who watches the watchers?',
    response: 'Section Thirty',
    part1: PHIL_PART_1,
    part2: PHIL_PART_2,
  },
  archive: {
    enabled: true,
    maxMessageChars: 400,
    welcome:
      'ARCHIVE ONLINE. Ledger partition mounted. I hold what the failsafe recovered: the personnel layer, the activity logs, and whatever further layers are released to you. Ask. I answer what the records support. I do not guess.',
  },
  deduction: {
    prompt: 'Complete the master deduction. Every field must verify against the Ledger.',
    template: DEDUCTION_TEMPLATE,
    slots: [
      {
        id: 'time',
        label: 'TIME',
        placeholder: 'e.g. 1:50 AM',
        canonical: '2:14 AM',
        accept: ['2:14', '02:14', '214', '2.14', 'fourteen past two', 'fourteen minutes past two', 'two fourteen'],
        reject: ['4:15', '04:15', '2:11', '2:19', '1:50', '2:05', '2:08', '2:17'],
        guidance:
          'Any phrasing of 2:14 in the morning passes. 4:15 is when the body was found and fails. 2:11 and 2:19 are the badge times either side and fail; other logged times fail.',
      },
      {
        id: 'suspect',
        label: 'SUSPECT',
        placeholder: 'Agent name',
        canonical: 'Nina Calder',
        accept: ['nina', 'calder', 's30-003', 'the intelligence analyst'],
        reject: ['mara', 'voss', 'elias', 'mercer', 'theo', 'blackwood', 'celeste', 'rowan'],
        guidance: 'Must identify Nina Calder, the intelligence analyst, Ledger id S30-003. Any other agent fails.',
      },
      {
        id: 'method',
        label: 'METHOD',
        placeholder: 'how it was done',
        canonical: 'the silver letter opener',
        accept: ['letter opener', 'opener', 'stabbed', 'stab', 'stabbing', 'blade'],
        reject: ['poison', 'tea', 'knife', 'scissors', 'screwdriver', 'gun', 'shot', 'strangle', 'choke', 'fountain pen'],
        guidance:
          'The letter opener, or stabbing with it, in any wording passes. A knife, the scissors, the screwdriver or a fountain pen names another agent’s belongings and fails, as does poison or any other method.',
      },
      {
        id: 'asset',
        label: 'ASSET',
        placeholder: 'what they were after',
        canonical: 'the hard copy of the S30 Ledger',
        accept: ['ledger', 'hard copy', 'hardcopy', 'master index', 'dossiers', 'personnel records', 'the files'],
        reject: [],
        guidance: 'The Ledger, its hard copy, the master index, the dossiers or the personnel records all pass.',
      },
      {
        id: 'motive',
        label: 'MOTIVE',
        placeholder: 'they wanted to…',
        canonical: 'to sell it to the international syndicate',
        accept: ['sell', 'sale', 'syndicate', 'money', 'buyer', 'profit', 'cash', 'paid', 'rich', 'payout', 'payday'],
        reject: ['revenge', 'brother', 'love', 'accident'],
        guidance: 'Selling the Ledger to the syndicate or any buyer, or doing it for money, passes. Revenge for her brother, love or an accident fails.',
      },
      {
        id: 'prop',
        label: 'PHYSICAL PROP',
        placeholder: 'where the hard copy is now',
        canonical: PROP_PLACEHOLDER,
        accept: [],
        reject: [],
        guidance: 'The GMs decide where the hard copy of the Ledger is hidden at the party and set the canonical answer and its phrasings here.',
      },
    ],
    successTitle: 'DEDUCTION VERIFIED',
    successBody: `Personnel records, recovered surveillance and the confiscated belongings converge on one agent. Nina Calder. Ledger id S30-003. Inside the Director's Office at 2:14 AM, silver letter opener on her person, a hard copy of the Ledger promised to the syndicate. Clearance revoked.

The hard copy is where you said it was. Recover it now.

Pendelton wrote: his last decision was you. He was right. Section 30 opened its first file thirty years ago. So did you.

Case closed. Happy thirtieth, Detective.`,
    failText:
      'DEDUCTION REJECTED. Somewhere in this room, someone just breathed out. Re-examine the Ledger and resubmit.',
    maxAttempts: null,
    feedback: 'pass_fail',
  },
  hints: {
    quick: {
      geo: ['Turn towards the water. One of the signs carries a name you can put on the map.'],
      gate: ['Your old code breaker is expecting the phrase. Give it exactly as the note has it, and write down what he reads back.'],
      hack: [
        'The Ledger key is a seven-letter designation. Field-craft vocabulary is worth a try.',
        'Spend the first two attempts on vowels and the common consonants, then narrow.',
      ],
      investigation: [
        'Every agent told you where they were between 11 PM and 4 AM. The Ledger holds what they wrote down. Hold the two against each other.',
        'The recovered records put exactly one agent inside the Director’s Office at the time of death. Then look at what was found in that agent’s pockets.',
      ],
      solved: [],
    },
  },
};
