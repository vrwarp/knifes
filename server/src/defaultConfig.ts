import { DEFAULT_WORD_BANK } from './content/words.js';
import type { GameConfig } from './types.js';

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

export const PHIL_PART_2 = `MATT: Jimmy... it's Matt. Phil asked me to call. We've got a breakthrough. Our team managed to crack another layer of Pendelton's encryption. Turns out, the Ledger you accessed earlier was only a partial archive.

What you opened were the personnel files. But Pendelton kept a separate set of records that automatically tracked the agents' actual movements using an advanced biometric tracker. We've managed to recover those records. Additionally, we finished processing the inventory of personal belongings confiscated from each agent when they were brought into headquarters.

And Jimmy... there are some discrepancies. At least one of the agents wasn't where they claimed to be on the night of the murder. I've uploaded the recovered information to your Ledger. You should have access to a new section labeled SURVEILLANCE RECORDS. Compare the recorded timestamps against what the agents told you during their interrogations. I think we're getting close.

(GM: press Release records in the console now.)

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
    title: 'RECOVERY COMPLETE // LEDGER DECRYPTED',
    body: `S30 LEDGER. ACCESS LEVEL: MAGENTA.

The personnel files are open: the five Section 30 agents now held at headquarters. Who they are, what they hold clearance for, where they are posted. Nothing about tonight: that you will have to get from them.

Pendelton was found at 04:15 in the Director's Office inside the secure safehouse. The killer is one of the five.

DIRECTIVE: Return to headquarters. Question each agent. Establish where every one of them was between 11:00 PM and 4:00 AM, and write it down. The Ledger may yet have more to say.

Recovery chain complete. The rest is detective work.`,
    buttonLabel: 'RETURN TO HEADQUARTERS',
  },
  ledger: {
    layer2Label: 'SURVEILLANCE RECORDS',
    layer2ReleasedText:
      'SECOND AUTHORIZATION RECEIVED. Surveillance records decrypted: badge, camera, terminal and vehicle events for all five agents, 10 PM to 4 AM, with the belongings taken off them at headquarters. A new section, SURVEILLANCE RECORDS, is open in your Ledger. Compare the recorded timestamps against what they told you.',
    interrogationWindow: '11:00 PM to 4:00 AM',
  },
  phil: {
    challenge: 'Who watches the watchers?',
    response: 'Section Thirty',
    part1: PHIL_PART_1,
    part2: PHIL_PART_2,
    secondCaller: 'Matt',
  },
  archive: {
    enabled: true,
    maxMessageChars: 400,
    welcome:
      'ARCHIVE ONLINE. Ledger partition mounted. I hold what the failsafe recovered: the personnel files. Where the agents were tonight is not in my records. Ask. I answer what the records support. I do not guess.',
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
        'Every agent told you where they were between 11 PM and 4 AM. Once the surveillance records reach you, hold what each of them said against what the systems recorded.',
        'The recovered records put exactly one agent inside the Director’s Office at the time of death. Then look at what was found in that agent’s pockets.',
      ],
    },
  },
};
