# Section 30 web app: requirements and design

Status: v1, 15 Oct 2026. Party 25 Oct. Phone-testable build target 20 Oct.
Source material: the "Expanded Plot Dossier" Google Doc plus the answers collected in the planning session.

## 1. Purpose

Jimmy's phone companion for the whodunnit, plus a live console for the game masters (Faith, Benji, Victor).
The site carries the recovery chain from the fake book in church to the final deduction at dessert,
and gives the GMs visibility and control the whole evening.

## 2. Decisions log

| Topic | Decision |
| - | - |
| Stages on the site | Optional geo landing (puzzle, reveal-only, or off), code gate, Wordle-style hacking puzzle, incident reveal, evidence vault, ARCHIVE terminal, deduction grid, final reveal. |
| Geo puzzle | GeoGuessr-style: an embedded Google Street View panorama (address and road labels hidden, walking optional) plus a map pin on OpenStreetMap, accepted within a configurable radius. Uploaded photos stand in when no Maps key is set. Switchable to reveal-only or off. |
| Phil call | One-way: Phil gives Jimmy the unlock code. Default `MAGENTA30`, editable. |
| Hacking puzzle | Wordle-like key race against an AI opponent (`claude-sonnet-5-5` scripting each round in advance, 8 ± 2 guesses to the key): each round draws a fresh 7-letter word from a GM-editable bank of ten keys, whose scripts are written when the configuration is saved; when the adversary has taken every key, a configurable free pass lets Jimmy through; the opponent guesses on a timer (10 s ± 5 s in the first round, 1.5× slower after each round it wins), Jimmy sees its colour feedback and must find the key first. Attempts are unlimited by default (a GM can cap them); when the opponent wins, the next word is drawn at once and a banner names the lost one. Solo mode keeps a fixed secret (`LANTERN`). |
| Reveal after puzzle | In-world incident record (03:45 window, three office entries) plus the order to return to base. |
| Evidence unlock | Both modes available: everything opens after the puzzle, or audio and toxicology sit behind `CANIS30` and `1996`. |
| Murder method | Poisoned tea is canon. The letter opener is a red herring on the desk. |
| Deduction grid | Six free-text slots in the dossier's sentence. Pass or fail only. AI grader with keyword fallback. |
| AI features | ARCHIVE terminal, GM hint copilot, grader, post-game case report, all on the Claude Agent SDK. |
| Model | `claude-opus-5-5` for every feature except the word-race opponent, which runs on `claude-haiku-5-5` (configurable). |
| Credential | Personal Claude subscription through the bundled Claude Code binary: `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, or `claude auth login` inside the container. An API key still works and outranks both. |
| GM console | Live progress and attempt log, jump/skip, push hints, reset stage or game, edit codes and text live, seal ARCHIVE, case report. |
| Hosting | Docker container on the Synology NAS, already exposed through the existing reverse proxy. |
| Evidence content | Written in code from the roster. GMs record the audio clip. |
| Timeline | Testable build by 20 Oct. |

## 3. Player flow

```
intro ─► geo (puzzle | reveal | off) ─► gate ─► hack ─► reveal ─► investigation ─► solved
                                                                   ├─ evidence vault
                                                                   ├─ ARCHIVE terminal
                                                                   └─ deduction grid
```

1. **Intro.** QR code opens the site. Section 30 briefing, one button.
2. **Geo.** A Street View panorama to look around in (or field photos without a Maps key) and a map. Tap to place a marker, "Triangulate". Within the radius the deli briefing appears.
   Reveal mode skips the map. Off mode skips the stage.
3. **Gate.** Enter the code Phil gives over the phone. Case, spaces and dashes are ignored.
4. **Hack.** Seven-letter keys in a terminal window in the app's magenta: a one-time briefing dialog (the configured intro, reopenable from a `?` button), a command line, then one transcript with both sides' attempts interleaved in the order they happened (a `you`/`adv` column tells them apart), the adversary's pending line, and Jimmy's prompt line at the bottom; each attempt is one monospace line with letters coloured by score and the pattern in ASCII (`#` placed, `+` misplaced, `.` absent). The on-screen keyboard is pinned to the bottom. In race mode (default) a second, smaller
   board shows the adversary's attempts (letters by default, colours only as an option) and reads THINKING... between
   them; the clock is never shown to the player. The
   adversary only sees its own feedback; Jimmy sees both boards. Jimmy finds the key first: key accepted, on to the
   reveal. The adversary finds it first: a new key is drawn from the bank at once (no repeats within a game), both
   boards clear, and a banner names the lost round and its word. Attempts are unlimited by default, so the boards
   grow and a round ends only on a solve; with a GM-set cap, Jimmy using all his attempts also rolls into the next
   word, while an adversary that uses all of its stalls and Jimmy keeps going. The lockout only applies in solo mode.
   The bank holds ten seven-letter keys by default (STEALTH, PHANTOM, DOSSIER, COURIER, NETWORK, SILENCE, MISSION, TRAITOR, CAPTURE, PAYLOAD). When the
   adversary has taken every key and the free pass is on, the phone shows the configured failsafe text for a few
   seconds and moves on to the reveal; with it off, the keys recycle.
   Input is an on-screen keyboard whose keys take the colours of what Jimmy has learned; the adversary's letters are
   shown by default (GM toggle for colours only). Both boards sit side by side so the whole race fits a phone screen
   above the keyboard. GMs can jump past it, push a hint, change the
   pace, or switch to solo mode live.
5. **Reveal.** Incident record with the 03:45 window and the directive to return to base.
6. **Investigation.** Three tabs.
   - Evidence: Director's note, access log with camera notes, audio intercept (player plus waveform notes), toxicology report and operative manifest. Sealed files take a passcode in passcode mode.
   - ARCHIVE: chat with the damaged mainframe.
   - Deduction: the sentence with six inputs. "ARCHIVE VERIFYING" while the grader runs.
7. **Solved.** The big reveal (Vector, envelope on the gift table, happy thirtieth), the case file when published, and the case materials for re-reading.

Hints from the GMs arrive as an "incoming transmission" overlay and stay listed under "Transmissions".
Progress lives on the server, so a dead phone or a refresh loses nothing; any device on the link continues.

## 4. GM console (`/gm`)

Password login. Panels: progress chips with times, jump/unlock and reset controls, seal/unseal ARCHIVE,
player status (attempts, guesses, the word in play and the opponent's board, a live Race / Solo switch for the word puzzle, evidence state, last deduction with per-slot verdicts), hint panel
(type, pick a quick hint, or draft with AI at nudge/clear/strong strength, then push), live event log,
ARCHIVE transcript with tool calls and cost, case report (generate, preview, publish, print), and the
full configuration editor with photo and audio uploads. Everything updates live over WebSocket.

## 5. AI features (Claude Agent SDK)

All four run through one wrapper (`server/src/ai/agent.ts`) with every built-in tool removed
(`tools: []`), `settingSources: []`, `permissionMode: 'dontAsk'`, a private `CLAUDE_CONFIG_DIR` under
the data volume, and a timeout. Mock mode replaces each with a deterministic stand-in when no key is set.

| Feature | Mechanics | Guardrails |
| - | - | - |
| ARCHIVE terminal | One `query()` per player message, resumed by `session_id`. In-process MCP tools: `search_access_log`, `camera_notes`, `read_manifest`, `read_toxicology`, `intercept_notes`, `ledger_lookup`, `directors_note`. Tools honour the vault's locks. | Persona prompt forbids naming the culprit, ranking suspects, inventing facts or leaving the fiction. Max 8 turns, low effort, one query at a time, 400-char input cap, GM seal switch. Resume failure falls back to a fresh session once. |
| GM copilot | `query()` with structured output `{hint, rationale}` from stage, attempts and recent log, at a chosen strength. | GM edits and approves before anything reaches the player. |
| Grader | `query()` with structured output per slot, given canonical answer, accept and reject lists and guidance. | Every slot must pass. Any failure of the AI path drops to keyword grading so the game never stalls. GMs see per-slot reasons. |
| Case report | `query()` over the full event log and transcript, Markdown out. | GM previews and publishes explicitly. |
| Word-race opponent | Scripted by default: one `query()` per round on `hack.aiModel` (default `claude-sonnet-5-5`, adaptive thinking) is told the key and a target length (`aiPlanGuesses ± aiPlanJitter`, default 8 ± 2) and returns the whole guess list, which the server validates (length within one, real-looking words, the key last and only last) and plays on the timer. Scripts are prepared for every bank word whenever the configuration is saved (and at boot), stored with the game state, kept across a game reset, and rewritten when the bank, plan length, model or thinking setting changes or the GM presses **Rewrite scripts**; a round only writes one at play time if none is ready. Without a credential the scripts are generated locally from a common-word vocabulary. Live style instead makes one `query()` per guess, structured output `{guess}`, given the key length and its own feedback so far. Paced server-side at `aiIntervalSeconds ± aiJitterSeconds`, both multiplied by `aiSlowdownPerRound` for every round it has already won (10 ± 5, 15 ± 7.5, 22.5 ± 11.25 s…), measured from when its previous guess was requested. | Low effort, extended thinking off unless `hack.aiThinking` is set, 2 turns, no tools. A bad or late answer (wrong length, repeat, timeout) is logged as `ai_error` and replaced by a deterministic bank solver so the race never stalls; mock mode uses the solver alone. A guess that returns after the round ended is dropped. The loop stops on any exit from the stage and resumes after a restart. |

Expected cost for the evening at Opus 5.5 rates: a few dollars.

## 6. Content and solution logic

- Access log (03:00 to 04:30): three office-door entries in the window: Ledger 03:30 (out 03:35), Vector 03:42 (out 03:47, property check logs a card envelope), Sentinel 03:44 (out 03:45 on the perimeter alarm). Cipher and Echo in the breakroom 03:40 to 03:50. Vector alone in the breakroom 03:34 to 03:39. Apex off post 03:40 to 03:51 feeding a puppy on camera. Horizon at the basement terminal until 03:45.
- Toxicology: Nightshade-7, thirty-minute onset, in the cup and the gifted tin. Letter opener clean. Death 04:15, so ingestion 03:45.
- Intercept notes: metallic thud (Sentinel), envelope-weight paper rustle, pour, alarm tone, two doors.
- Manifest: eight public dossiers, no secrets.
- Canonical deduction: 03:45 AM, Agent Vector, neurotoxin in the Earl Grey, the Ledger on Drive 30-ALPHA, to sell it to a syndicate, the birthday card envelope on the gift table.

## 7. Architecture

- `server/`: Express 5 API, `ws` WebSocket hub, `node:sqlite` store (config, state, events, transcript), Agent SDK. Player view is redacted server-side: no codes, secret word, passcodes or canonical answers ever reach the phone.
- `client/`: React SPA, terminal styling, Leaflet map, no external fonts or CDNs besides OpenStreetMap tiles.
- Auth: GM cookie signed with HMAC; optional player key in the QR link; GM password compared in constant time.
- Deployment: multi-stage Dockerfile on `node:22-bookworm-slim`, non-root user, `/data` volume for SQLite, uploads and SDK session files. Health check on `/healthz`.

### API summary

Player (`/api/player/*`): `state`, `start`, `geo/guess`, `geo/proceed`, `gate`, `hack/guess`, `hack/retry` (race: starts the next round), `reveal/continue`, `evidence`, `evidence/unlock`, `audio`, `archive` (GET, POST), `deduction`.
GM (`/api/gm/*`): `login`, `logout`, `me`, `overview`, `config` (PUT), `stage`, `reset`, `hint`, `hint/draft`, `archive/lock`, `archive/reset`, `report/generate`, `report/publish`, `upload`, `upload/:id` (DELETE).
WebSocket `/ws?role=player|gm`: state snapshots, events (GM only), hints, ARCHIVE messages, ARCHIVE busy flag.

## 8. What the GMs still supply

- Deli coordinates in the config panel, plus `GOOGLE_MAPS_API_KEY` in `.env` for Street View (or two to four field photos instead).
- The audio clip (thud, rustle, pour, alarm, doors) recorded by the GMs, uploaded in the config panel.
- Final values for Phil's code and, if used, the two passcodes.
- `ANTHROPIC_API_KEY`, `GM_PASSWORD`, optional `PLAYER_KEY` in `.env`.
- The physical props the roster calls for. The envelope with Drive 30-ALPHA goes on the gift table.

## 9. Test plan

- Unit: word scoring, geo distance, fallback grader, state machine, player-view redaction, bank solver, race loop with fake timers (`server`, vitest).
- End to end in mock mode: full run from intro to solved through the real HTTP and WebSocket paths, GM login, jump, reset, hint push (`e2e/`, Playwright).
- Live AI: with a key set, exercise the ARCHIVE with the five canonical questions (who was in the office at 03:45, what does the intercept show, read the toxicology, who is Vector, who did it), the grader with the canonical answers and a letter-opener answer, one hint draft, one case report.
- Dry run on real phones before the 23rd, over cellular, through the reverse proxy.
