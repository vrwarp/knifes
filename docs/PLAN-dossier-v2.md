# Plan: bring the app in line with the Expanded Plot Dossier (October 2026 revision)

Status: proposal, 18 Oct 2026. Nothing below is implemented yet. Approve or amend, then the work lands on this branch.

Source: the "Expanded Plot Dossier: Section 30" PDF (15 pages: overview, intro letter and magic square, S30 Ledger Layer 01 and Layer 02, Phil's script Parts 1 and 2), plus the decisions recorded in section 1.

## 1. Decisions taken for this revision

| Topic | Decision |
| - | - |
| Deduction grid | Keep six slots and re-canon them: time 2:14 AM, Nina Calder, the letter opener, the hard copy of the S30 Ledger, selling it to the syndicate, and a physical prop the GMs fill in. |
| Motive and prop | Motive stays "sell it to the international syndicate" from the intro letter. The prop slot ships with a placeholder the GMs must edit; the readiness check warns while it is unset. |
| ARCHIVE terminal | Kept. Its tools read Layer 01 and Layer 02 and honour the Layer 02 lock. |
| Layer 02 release | A GM button in the console, or a passcode Phil can read out. Either path unlocks it. |
| Nina's alibi | Her self-reported Layer 01 log claims the archives from 2:00 to 2:30 AM, so Layer 02 catches the lie. All other agents' logs stay as the dossier has them. |
| After the word race | A short LEDGER DECRYPTED screen with one button, then the investigation with Layer 01 open. |
| Old evidence | Access log, camera notes, toxicology, eight-agent manifest, Director's note, Ledger fragments and the audio intercept upload are removed entirely. |
| Geo | Lake Elizabeth, Los Angeles County. Map centres near 34.66, -118.41. The target stays empty until a GM pins it. |
| Word bank | DOSSIER, NETWORK and MISSION appear in the new Ledger copy and are swapped for CIPHERS, SHADOWS and BEACONS. |
| Phil's script | Both parts and the challenge phrase live in the config and show in a GM panel beside the Layer 02 release button. |
| Interrogation window | The unlock screen and the Layer 01 header tell Jimmy to establish each agent's movements between 11 PM and 4 AM. |

## 2. The new canon in one place

- Section 30 was created thirty years ago. Arthur Pendelton kept the S30 Ledger, the master index of every operative.
- Pendelton learned someone in his inner circle meant to purge the digital archives and sell a hard copy of the Ledger to an international syndicate. He locked the system down and activated the emergency failsafe, naming Jimmy.
- He was found at 04:15 in the division's secure safehouse. Layer 02 confirms death at 2:14 AM in the Director's Office.
- Five agents are held at headquarters: Mara Voss (Security Director), Elias Mercer (Systems Architect), Nina Calder (Intelligence Analyst), Theo Blackwood (Field Operative), Celeste Rowan (Diplomatic Liaison).
- The weapon is a letter opener (the Bananagram tiles in the book safe anagram to LETTER OPENER). Nina's recovered evidence includes a silver letter opener.
- Layer 02 puts Nina inside the Director's Office from 2:11 to 2:19 AM, covering 2:14. Everyone else is verified elsewhere.
- Red herrings: Mara accessed a restricted personnel file at 2:09 (unrelated disciplinary case). Elias copied schematics to a USB drive at 2:17 (abandoned project). Theo omitted an eight-minute stop at a restricted storage facility at 1:47. Celeste's meeting was an unauthorised exchange negotiation.
- Codes: gate code `S30GHOST`. Challenge phrase "Who watches the watchers?", response "Section Thirty". Book safe `132` (physical; not in the app).

## 3. Player flow after the change

```
intro ─► geo (Lake Elizabeth) ─► gate (S30GHOST) ─► hack ─► reveal (LEDGER DECRYPTED) ─► investigation ─► solved
                                                                                          ├─ Ledger: Layer 01 (open) and Layer 02 (sealed until released)
                                                                                          ├─ ARCHIVE terminal
                                                                                          └─ deduction grid
```

1. Intro. Unchanged mechanically. Text drops the mainframe wipe and Drive 30-ALPHA; it speaks of the failsafe recovery protocol and the Ledger.
2. Geo. Unchanged mechanically. Briefing and reveal text point at the drop at Lake Elizabeth and the note waiting there.
3. Gate. Prompt says the note tells him to call his old code breaker and give the phrase; whoever answers sends a recovery authorisation code. Default code `S30GHOST`. Success text: "Recovery authorisation accepted. Initiating hacking sequence."
4. Hack. Unchanged. New default bank: STEALTH, PHANTOM, CIPHERS, COURIER, SHADOWS, SILENCE, BEACONS, TRAITOR, CAPTURE, PAYLOAD.
5. Reveal. Title LEDGER DECRYPTED // LAYER 01 RELEASED. Body: the Ledger's personnel layer is open, the five agents are held at headquarters, return there and establish where each was between 11 PM and 4 AM. Button RETURN TO HEADQUARTERS.
6. Investigation. Three tabs.
   - Ledger. Header line repeats the 11 PM to 4 AM window. Layer 01: five cards, each with id, name, position, profile and self-reported activity log. Layer 02, labelled CLASSIFIED EVIDENCE: sealed card with a passcode field until released; once open, five cards with verified activity, recovered evidence and additional findings, plus the incident line (death 2:14 AM, Director's Office). A "new section" badge appears when Layer 02 opens mid-conversation.
   - ARCHIVE. Same chat, new tools and persona.
   - Deduction. Same grid, new sentence and slots.
7. Solved. Reveal names Nina Calder, the letter opener, the hard copy of the Ledger, the syndicate, and the GM-set prop. Birthday line stays.

## 4. Changes by area

### 4.1 Story content

- `server/src/content/evidence.ts` becomes `server/src/content/ledger.ts` with two typed arrays, `LAYER_01` and `LAYER_02`, each with five `AgentRecord` entries (id `S30-001` to `S30-005`, name, position, profile or verified activity, log lines, evidence list, findings). Text transcribed from the dossier, with Nina's Layer 01 log changed to "2:00 to 2:30 AM: Working in the archives." The old exports are deleted.
- `server/src/defaultConfig.ts`: new intro, geo texts and map centre, gate prompt, code and success text, reveal title, body and button, deduction template and slots, success and fail text, hints, and the new `phil` and `ledger` config sections below.
- `server/src/content/words.ts`: the three bank swaps.
- Deduction template: "At [TIME], [SUSPECT] killed Director Pendelton with [METHOD] to take [ASSET] because [MOTIVE], and hid the hard copy of the Ledger in [PHYSICAL PROP]."
- Slots:
  - TIME: canonical 2:14 AM. Accept 2:14, 214, 2.14, "fourteen minutes past two". Reject 4:15, 04:15, 2:11, 2:19, 1:50, 2:05.
  - SUSPECT: canonical Nina Calder. Accept nina, calder, S30-003. Reject mara, voss, elias, mercer, theo, blackwood, celeste, rowan.
  - METHOD: canonical the silver letter opener. Accept letter opener, opener, stabbed, stab, blade. Reject poison, tea, knife, scissors, screwdriver, gun, shot, strangle.
  - ASSET: canonical the hard copy of the S30 Ledger. Accept ledger, hard copy, hardcopy, master index, dossiers, personnel records.
  - MOTIVE: canonical to sell it to the international syndicate. Accept sell, sale, syndicate, buyer, money, profit, paid. Reject revenge, brother, accident, love.
  - PHYSICAL PROP: canonical `[GM: SET THE HIDING PLACE]`. Accept and reject lists empty. The readiness check warns while the canonical text still starts with `[GM:`.

### 4.2 Config schema and state

- `GameConfig.evidence` is replaced by `GameConfig.ledger`:
  - `layer2Passcode: string` (default `MAGENTA30`, since Phil already has that word in the old plan; GMs may change it).
  - `layer2Label: string` (default `CLASSIFIED EVIDENCE`).
  - `layer2ReleasedText: string` shown as an in-app transmission when it opens.
  - `interrogationWindow: string` (default `11:00 PM to 4:00 AM`).
- New `GameConfig.phil`: `challenge`, `response`, `part1`, `part2` strings, defaulting to the dossier's script.
- `EvidenceGateMode`, `passcodes`, `audioUploadId` and `audioNotes` are removed. The config migration bumps `version` to 2 and maps any stored v1 config by dropping the old block and inserting defaults, so a running NAS install does not break on upgrade.
- `GameState.evidence` becomes `GameState.ledger: { layer1: boolean; layer2: boolean; layer2ReleasedAt: number | null; layer2Source: 'gm' | 'passcode' | null }`. `applyInvestigationUnlocks` sets `layer1` on entering the investigation. Resetting the stage or game clears both.
- Player view exposes `ledger.layer1`, `ledger.layer2` and the label; never the passcode.
- New event types `ledger_release` (payload `{ layer: 2, source }`) and `ledger_passcode` (rejected attempts, truncated). `evidence_unlock` goes.

### 4.3 Server API

- `GET /api/player/ledger` replaces `GET /api/player/evidence`: returns Layer 01 always (once in the investigation), Layer 02 only when released, else `{ layer2: null, locked: true }`.
- `POST /api/player/ledger/unlock { passcode }` replaces `evidence/unlock`. Normalised like the gate code. Wrong code returns 400 `PASSCODE REJECTED` and logs the attempt.
- `POST /api/gm/ledger/release { layer: 2, released: boolean }` for the GM button, with the ability to re-seal in rehearsal.
- `GET /api/player/audio` and the audio branch of `POST /api/gm/upload` are removed. Photo uploads stay.
- WebSocket snapshots carry the new state; a `transmission` push with `layer2ReleasedText` fires on release.

### 4.4 AI

- `server/src/ai/archive.ts`: new persona standing facts (Section 30 created thirty years ago, the Ledger, Pendelton found 04:15 in the safehouse, five agents held at headquarters, a Layer 02 exists and is sealed until recovery completes). Tools: `read_personnel(who?)` for Layer 01, `read_classified(who?)` for Layer 02 (returns a lock notice until released), `search_activity(who?, from?, to?, layer?)` to filter log lines by time, `ledger_lookup(term)` over a small new fragment set (Section 30, the Ledger, the hard copy, the syndicate, Pendelton, the failsafe). Rule 2 (never name the killer) stays. The mock reply is rewritten to match.
- `server/src/ai/copilot.ts`: the solution line becomes "at 2:14 AM Nina Calder killed the Director with the silver letter opener to sell the hard copy of the Ledger to the syndicate; the hard copy is hidden in the GM-set prop" and reads the prop from config.
- `server/src/ai/setup.ts`: the night description (letter at church, book safe, QR, Lake Elizabeth, Phil, hack, headquarters), and `get_case_files` returns both layers.
- `server/src/ai/grader.ts` and `report.ts`: check for embedded facts; the grader works from the slot specs so only its examples may need a touch.

### 4.5 Client

- `client/src/player/Evidence.tsx` becomes `Ledger.tsx`: two sections, five cards each, the passcode form on the sealed Layer 02 card, the interrogation window in the header. The `inWindow` highlight and the audio player go.
- `Investigation.tsx` tab label EVIDENCE becomes LEDGER. A dot on the tab when Layer 02 has opened and has not been viewed.
- `Deduction.tsx`: verifying lines become CROSS-REFERENCING PERSONNEL RECORDS, MATCHING SURVEILLANCE TIMESTAMPS, CHECKING RECOVERED EVIDENCE, ARCHIVE VERIFYING.
- `Reveal.tsx` and `Solved.tsx`: text only, from config.
- `client/src/types.ts`: mirror the schema changes.
- GM console (`panels.tsx`, `ConfigEditor.tsx`): a Phil panel showing challenge, response, Part 1 and Part 2 with the gate code and Layer 02 passcode in large type, and a Release Layer 02 button with confirmation and a Re-seal option. The config editor gains the `phil` and `ledger` sections and loses the evidence gate mode, passcodes and audio upload.
- Readiness checks in `service.ts`: warn when the prop canonical is unset, when the geo target is empty, and when the Layer 02 passcode equals the gate code.

### 4.6 Tests

- Unit (`server`): state machine for Layer 01 and Layer 02 unlock, reset, migration of a v1 config, passcode normalisation, player view redaction (no passcode, no Layer 02 before release), fallback grader with the new slots (letter opener passes, poison fails, each wrong agent fails), word bank still ten unique seven-letter keys absent from the Ledger text.
- End to end (`e2e`): `fixtures.ts` right answers; `player-journey`, `puzzles`, `investigation`, `gm-console`, `history-assistant`, `smoke.mjs`, `walkthrough.mjs`, `screens.mjs` updated for S30GHOST, the Ledger tab, the Layer 02 release from the GM console and via passcode, and the Nina answers. Secret-leak checks look for S30GHOST, the Layer 02 passcode, Nina Calder, canonical and guidance.
- A new e2e: Phil Part 2 flow. GM presses Release, the player's Ledger tab shows CLASSIFIED EVIDENCE within the socket round trip, and the ARCHIVE answers a Layer 02 question only after release.

### 4.7 Docs

- `docs/SPEC.md`: decisions log, player flow, AI table, content and solution logic, what the GMs supply, test plan.
- `README.md`: configuration steps (Lake Elizabeth pin, prop, Phil's codes) and the QR note; remove the audio clip and deli references.
- `docs/DESIGN-REVIEW.md` is history and stays as is.

## 5. Order of work and checkpoints

1. Schema, migration, state and server API, with unit tests green. Checkpoint: existing e2e still boots.
2. Content: `ledger.ts`, default config, word bank.
3. Client Ledger tab, reveal, deduction and GM panels.
4. ARCHIVE, copilot and setup prompts, mock replies.
5. e2e suite and smoke updated and green in mock mode.
6. SPEC and README.

Each step is one commit on `ccr-95ffbcbc-u7yrlc`. The full run is about a day of work.

## 6. Still open (defaults applied unless you say otherwise)

- The hiding place of the Ledger hard copy at the party. Placeholder in config until set.
- Layer 02 passcode text. Default `MAGENTA30`.
- Whether the Lake Elizabeth note on site is a Section 30 card with the challenge phrase or just Phil's number. The app only needs Phil to say the code either way.
- The intro letter says safehouse, Layer 02 says Director's Office. The app uses "the Director's Office inside the secure safehouse" everywhere to reconcile them.

## 7. ARCHIVE as cross-reference engine and interrogation notebook

Status: design agreed 18 Oct 2026, not built. Decisions from the ideation session are in 7.1; the rest follows from them.

### 7.1 Decisions

| Topic | Decision |
| - | - |
| Pointing out differences | Never. The ARCHIVE lays records side by side and says nothing about them. No "aligned", "differs", "not in statement" labels, and no naming of a contradiction. Jimmy reads the columns. |
| Filing | Any sentence that places an agent files a statement under that agent ("Mara was in the control room", "Celeste says she left at quarter to one"). Questions are answered as before. |
| Ambiguous names | "the analyst", "she", a nickname: the ARCHIVE asks once ("File under Nina Calder?") and files nothing until he confirms or names someone. |
| Filing reply | One line, in character: `FILED. S30-005 Celeste Rowan, statement 2.` |
| Statement text | Verbatim as typed, plus a parsed time when the sentence carries one (12:45 AM, "quarter to one", "around three"), so it can sit on the timeline. |
| Before Layer 02 | Side by side shows two blocks per agent: what he was told, what they wrote down (Layer 01). The recorded block appears after the release. |
| Layout | Stacked per agent, one short list per source, in chat and in the notes section. No multi-column tables on the phone. |
| Visibility | A DETECTIVE'S NOTES section on the Ledger tab, and the GM console's ARCHIVE panel grouped by agent. |
| Corrections | Jimmy by asking ("strike Celeste's second statement", "move that to Theo"); GMs can delete or re-assign any entry from the console. |
| Downstream | The hint copilot sees the notebook (who has not been questioned, what was said). The case report quotes his notes. The grader is unchanged. |

### 7.2 What Jimmy experiences

Welcome line gains one sentence: "Tell me what each agent tells you and I will hold it against the Ledger." The Layer 01 header on the Ledger tab says the same in six words.

Filing:

```
> celeste says she left at quarter to one for a meeting across town
FILED. S30-005 Celeste Rowan, statement 1.
Time read as 12:45 AM.
```

Reading back:

```
> what do I have on elias
S30-002 Elias Mercer. Statements on file:
1. working from home from about two  (~2:00 AM)
2. never went near the server room after midnight
```

Side by side, before the release:

```
> hold nina against the ledger
S30-003 NINA CALDER
Told you:
  ~2:00 AM  in the archives all night
Wrote down:
  1:55 AM   Seen near the Director's Office.
  2:00–2:30 AM  Working in the archives.
Layer 02 sealed.
```

After the release the same request adds a third block, `Recorded:`, with the Layer 02 lines, and `hold everyone against the ledger` prints all five agents in id order. Nothing in the reply says which lines disagree.

Corrections:

```
> strike elias statement 2
STRUCK. S30-002 Elias Mercer, statement 2.
```

The notes section on the Ledger tab lists the five agents with their statements in filing order, each with its parsed time and a tap-to-strike control, and the tab carries the amber dot when a statement is filed from the chat while he is elsewhere.

### 7.3 What the GMs see

The ARCHIVE panel gets a "Notebook" strip above the transcript: five agent chips with a statement count, red for zero. Expanding an agent lists the statements with delete and re-assign controls. The NOW strip adds "notes 3/5 agents" during the investigation. The copilot prompt gains the notebook, so a nudge can be "You have nothing on file for Mara yet" and a strong hint can quote his own note back against the Ledger line.

### 7.4 Mechanics

- **Storage.** A `statements` table: id, agent id, text, parsed time (minutes from 6 PM, nullable), filed at, struck at, source (`player` or `gm`). Cleared on an investigation reset and a game reset. Exposed in the player view as counts, and in the GM state in full.
- **Routes.** Player: `GET /api/player/notes`, `POST /api/player/notes/:id/strike`. GM: `DELETE /api/gm/notes/:id`, `POST /api/gm/notes/:id/assign { agent }`. The chat is the main way in; the routes back the notes section and the console.
- **Tools** added to the ARCHIVE server: `file_statement(agent, text, time?)`, `read_statements(agent?)`, `strike_statement(agent, n)`, `compare(agent?)`. `compare` builds the stacked blocks from statements, Layer 01 and, when released, Layer 02, sorted by time within each block. The existing tools stay.
- **Persona.** Rule 2 gains: "When asked to hold statements against the Ledger, print each source as its own block and add no comment. The words lie, alibi, contradict, match, confirm, suspect and guilty never appear in your output." A filing rule is added: "A message that attributes a location, time or action to an agent is a statement to file, not a question. File it with `file_statement`, reply with the one-line confirmation, and answer nothing else unless the message also asks a question. If the agent is unclear, ask once and file nothing."
- **Time parsing.** A small deterministic parser on the server, shared with the tool and the mock: `h:mm`, `h am/pm`, "quarter to/past", "half past", "around/about", "midnight", "noon". The ARCHIVE passes `time` when it is sure; the server parses the text otherwise. Unparsed is fine, the statement just has no time.
- **Mock mode.** Regex filing on the five names and ids plus "says", "said", "told", "claims", "was", "went", "left"; the same stacked formatter for `compare`; "strike" handled by agent and number. Enough to rehearse the whole loop without a credential.
- **Copilot and report.** Both prompts receive the notebook as `AGENT: statement (time)` lines. The report prompt is told it may quote them.

### 7.5 Tests

- Unit: time parser table; filing, striking and re-assigning; the compare formatter before and after release; player view carries counts only; investigation reset clears the table; the GM delete and assign routes.
- End to end: file two statements from the chat, see them in the notes section and the GM notebook strip, strike one by chat, re-assign one from the console, ask for the side by side before and after the release and check the third block only appears after; the player API never carries another agent's statements before they are filed; mock ARCHIVE asks when the name is ambiguous.

### 7.6 Open points

- Whether a statement that names two agents ("Theo and Mara were together") files under both or asks.
- Whether the notes section should let Jimmy type a statement directly, bypassing the chat. Proposed: no, the chat is the interface; the section is for reading and striking.
- The wording of the single line that tells Jimmy the notebook exists. Proposed above; it is config text either way.
