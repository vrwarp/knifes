# Section 30 web app: requirements and design

Status: v2, 18 Oct 2026. Party 25 Oct. Phone-testable build target 20 Oct.
Source material: the "Expanded Plot Dossier" (October revision: intro letter and magic square, S30 Ledger personnel files and surveillance records, the two call scripts) plus the decisions recorded in [PLAN-dossier-v2.md](PLAN-dossier-v2.md).

## 1. Purpose

Jimmy's phone companion for the whodunnit, plus a live console for the game masters (Faith, Benji, Victor).
The site carries the recovery chain from the fake book in church to the interrogation at the party,
and gives the GMs visibility and control the whole evening.

## 2. Decisions log

| Topic | Decision |
| - | - |
| Stages on the site | Optional geo landing (puzzle, reveal-only, or off), code gate, Wordle-style key race, Ledger decrypted notice, investigation (two-layer Ledger, ARCHIVE terminal). The investigation is the last stage; Jimmy names the killer at the table. |
| Physical chain | The intro letter, the magic square (combination 132), the book safe, the QR code and the Bananagram tiles (LETTER OPENER) are props, not app features. |
| Geo puzzle | GeoGuessr-style: an embedded Google Street View panorama (address and road labels hidden, walking optional) plus a map pin on OpenStreetMap, accepted within a configurable radius. The map centres on Lake Elizabeth, Los Angeles County; the GMs pin the exact drop. Uploaded photos stand in when no Maps key is set. Switchable to reveal-only or off. |
| The calls | Two one-way calls, scripts in the config and the GM console. Call 1: Jimmy gives the challenge "Who watches the watchers?", Phil answers "Section Thirty" and reads the recovery authorization code `S30GHOST`. Call 2, from Matt (the caller's name is configurable): Matt announces the breakthrough; a GM presses Release records in the console. |
| Hacking puzzle | Wordle-like key race against an AI opponent (`claude-sonnet-5-5` scripting each round in advance, 8 ± 2 guesses to the key): each round draws a fresh 7-letter word from a GM-editable bank of ten keys (STEALTH, PHANTOM, CIPHERS, COURIER, SHADOWS, SILENCE, BEACONS, TRAITOR, CAPTURE, PAYLOAD; none appears in the Ledger text); when the adversary has taken every key, a configurable free pass lets Jimmy through; the opponent guesses on a timer (10 s ± 5 s in the first round, 1.5× slower after each round it wins). Attempts are unlimited by default. Solo mode keeps a fixed secret (`LANTERN`). |
| After the puzzle | A short LEDGER DECRYPTED notice: the personnel files are open, the Director was found at 04:15, return to headquarters and establish every agent's movements between 11:00 PM and 4:00 AM. |
| The Ledger | PERSONNEL FILES (service, posting, a two-line profile; name on one line, role on the next, the id inside the card) open with the investigation. The agents' accounts of the night come from the interviews at the table; see docs/ACTOR-BRIEFS.md. SURVEILLANCE RECORDS (recorded activity from 10 PM, confiscated belongings, additional findings, time of death 2:14 AM in the Director's Office) are absent from the phone until a GM presses Release records; the release pushes a transmission and the section appears. Nothing before the release says they exist. The records can be hidden again in rehearsal. |
| Nina's alibi | At the table she claims the archives from 2:00 to 2:30 AM (the dossier had her self-report in the office); the surveillance records put her inside the office 2:11 to 2:19. The other four actors' timelines are in the briefs. |
| Murder method | The silver letter opener found on Nina. Poison, which the first draft used, is a rejected answer. |
| AI features | ARCHIVE terminal, GM hint copilot, setup assistant, post-game case report, all on the Claude Agent SDK. |
| Model | `claude-opus-5-5` for every feature except the word-race opponent (`claude-sonnet-5-5`, configurable). |
| Credential | Personal Claude subscription through the bundled Claude Code binary: `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, sign-in from the GM console, or `claude auth login` inside the container. An API key still works and outranks them. |
| GM console | Live progress and attempt log, jump/skip, push hints, reset stage or game, calls panel with both scripts and codes and the records release, seal ARCHIVE, case report, edit codes and text live. |
| Hosting | Docker container on the Synology NAS, already exposed through the existing reverse proxy. |
| Content | Written in code from the dossier (`server/src/content/ledger.ts`). No audio clip. |

## 3. Player flow

```
intro ─► geo (puzzle | reveal | off) ─► gate ─► hack ─► reveal ─► investigation
                                                                   ├─ Ledger: personnel files (open) · surveillance records (absent until released)
                                                                   └─ ARCHIVE terminal
```

1. **Intro.** QR code opens the site. Failsafe recovery briefing, one button.
2. **Geo.** A Street View panorama to look around in (or field photos without a Maps key) and a map. Tap to place a marker, "Triangulate". Within the radius the drop-point text appears. Reveal mode skips the map. Off mode skips the stage.
3. **Gate.** Enter the recovery authorization code Phil gives over the phone on the console's on-screen keyboard (letters and digits). Case, spaces and dashes are ignored.
4. **Hack.** Seven-letter keys in a terminal window: a one-time briefing dialog, one interleaved transcript of both sides' attempts, the on-screen keyboard pinned to the bottom. In race mode (default) the adversary's attempts show on the same transcript and it reads THINKING... between them. Jimmy finds the key first: key accepted, on to the reveal. The adversary finds it first: a new key is drawn at once and a banner names the lost round. When the adversary has taken every key and the free pass is on, the configured failsafe text shows and the stage moves on.
5. **Reveal.** RECOVERY COMPLETE // LEDGER DECRYPTED, the 04:15 discovery, the directive to return to headquarters and the 11 PM to 4 AM window. Button RETURN TO HEADQUARTERS.
6. **Investigation.** Two tabs. This is the last screen.
   - Ledger: a header with the interrogation window; PERSONNEL FILES (five agent cards: name, position, service, posting, profile, the id inside; the first opens by default); SURVEILLANCE RECORDS (not rendered until released, then the incident line, five cards with recorded activity, recovered evidence and findings, and the duty log); the decryption notice for re-reading. The tab carries an amber dot from the moment the records are released until he looks.
   - ARCHIVE: chat with the records mainframe.

Transmissions from the GMs (and the records release) arrive as an "incoming transmission" overlay and stay listed under "Transmissions".
Progress lives on the server, so a dead phone or a refresh loses nothing; any device on the link continues.

## 4. GM console (`/gm`)

Password login. Panels: NOW strip, progress chips with jump/unlock and reset controls, seal/unseal ARCHIVE, **The calls & the Ledger** (challenge and response, the gate code in large type, who makes each call, records state, Release / Hide button, the two call scripts), player status (attempts, guesses, the word in play, Ledger files), hint panel (type, pick a quick hint, or draft with AI, then push), live event log, ARCHIVE transcript, case report, setup assistant with the readiness list, and the full configuration editor with photo uploads. Everything updates live over WebSocket.

## 5. AI features (Claude Agent SDK)

All run through one wrapper (`server/src/ai/agent.ts`) with every built-in tool removed, `settingSources: []`, `permissionMode: 'dontAsk'`, a private `CLAUDE_CONFIG_DIR` under the data volume, and a timeout. Mock mode replaces each with a deterministic stand-in when no credential is set.

| Feature | Mechanics | Guardrails |
| - | - | - |
| ARCHIVE terminal | One `query()` per player message, resumed by `session_id`. In-process MCP tools: `read_personnel` (personnel files), `read_classified` (surveillance records; a plain [NO RECORD] until released, never a hint that they exist), `search_activity` (surveillance records by agent, time window, place and keyword; personnel fields by keyword), `ledger_lookup` (index fragments). | Persona prompt forbids naming the culprit, ranking suspects, saying a record contradicts another, inventing facts or leaving the fiction. Max 8 turns, low effort, one query at a time, 400-char input cap, GM seal switch. |
| GM copilot | `query()` with structured output `{hint, rationale}` from stage, attempts, recent log and the configured solution, at a chosen strength. Told whether the surveillance records are released so a hint never leaks that they exist. | GM edits and approves before anything reaches the player. |
| Setup assistant | `query()` over the live config, the case files (both layers), the readiness list and uploaded photos; proposes edits a GM applies. | Never edits on its own; proposals are versions only once applied. |
| Case report | `query()` over the full event log and transcript, Markdown out, headings CASE FILE 30-0214 and following. | GMs only: preview and print. It never reaches the phone. |
| Word-race opponent | Scripted by default: one `query()` per round writes the whole guess list for a bank word; scripts are prepared for every bank word when the configuration is saved and kept across game resets. Live style makes one `query()` per guess. | Low effort, 2 turns, no tools. A bad or late answer is replaced by a deterministic solver so the race never stalls. |

## 6. Content and solution logic

- Personnel files: five, no times. The agents' accounts come from the actors (docs/ACTOR-BRIEFS.md); Nina claims the archives for 2:00 to 2:30.
- Surveillance records: recorded activity from 10 PM to 4 AM for all five, dense around 2:14 AM but only Nina has a line at exactly 2:14 (the others sit 2:11 to 2:17), confiscated belongings, and one unrelated secret each (Mara's restricted file at 2:09, Elias's unauthorised USB copy at 2:17, Theo's omitted 1:47 stop, Celeste's private negotiation). Nina badged into the Director's Office at 2:11, was inside at 2:14 and left at 2:19; a silver letter opener was on her.
- Canon: 2:14 AM, Nina Calder, the silver letter opener, the hard copy of the S30 Ledger, to sell it to the international syndicate. The hint copilot steers towards it.
- The intro letter says safehouse and the surveillance records say Director's Office; the app says "the Director's Office inside the secure safehouse".

## 7. Architecture

- `server/`: Express 5 API, `ws` WebSocket hub, `node:sqlite` store (config versions, state, events, transcript), Agent SDK. Player view is redacted server-side: no codes, secret word or canonical answers ever reach the phone, and Layer 02 content is not served until released.
- `client/`: React SPA, terminal styling, Leaflet map, no external fonts or CDNs besides OpenStreetMap tiles and, with a key, Google Street View.
- Auth: GM cookie signed with HMAC; optional player key in the QR link; GM password compared in constant time.
- Deployment: multi-stage Dockerfile on `node:22-bookworm-slim`, non-root user, `/data` volume for SQLite, uploads and SDK session files. Health check on `/healthz`.
- Upgrades: a configuration saved before this revision loses its evidence-vault block and picks up the `ledger` and `phil` defaults; a saved game state gains the personnel files if it was already investigating.
- Every word of the story is in the configuration and editable in the console: the Ledger itself (`ledger.content`: the agents' personnel facts, profiles, recorded activity, belongings and findings; the incident; the duty log; the index fragments), the section names and the header line, the ARCHIVE's persona and its not-on-file answer, the case-file brief (`report.prompt`), and every other line the phone prints (`text`, grouped by screen, with `{placeholders}` filled at render time). The server validates surveillance times as clock times so the ARCHIVE's window search keeps working. A configuration saved before this revision picks up all of it from the defaults.

### API summary

Player (`/api/player/*`): `state`, `start`, `geo/guess`, `geo/proceed`, `gate`, `hack/guess`, `hack/retry`, `reveal/continue`, `ledger`, `archive` (GET, POST).
GM (`/api/gm/*`): `login`, `logout`, `me`, `overview`, `config` (PUT), `config/history`, `config/restore`, `stage`, `reset`, `hint`, `hint/draft`, `ledger/release`, `archive/lock`, `archive/reset`, `hack/scripts`, `report/generate`, `assistant/*`, `claude/*`, `upload` (photos), `upload/:id` (DELETE).
WebSocket `/ws?role=player|gm`: state snapshots, events (GM only), hints, ARCHIVE messages, ARCHIVE busy flag, assistant messages (GM only).

## 8. What the GMs still supply

- The Lake Elizabeth drop point in the config panel, plus `GOOGLE_MAPS_API_KEY` in `.env` for Street View (or two to four field photos instead).
- Where the hard copy of the Ledger is hidden at the party: the PHYSICAL PROP canonical answer and its accepted phrasings.
- Final values for Phil's two codes if the defaults are not wanted.
- `GM_PASSWORD`, a Claude credential, optional `PLAYER_KEY` in `.env`.
- The physical props: the letter and magic square, the book safe set to 132, the QR code and tiles, the drop-point note, five agent name cards, and the hard copy of the Ledger.

## 9. Test plan

- Unit: word scoring, geo distance, state machine including the personnel and surveillance releases and hiding again, config and state migration (including a save from the removed solved stage), player-view redaction, bank solver, race loop with fake timers (`server`, vitest).
- End to end in mock mode: full run from intro to the investigation through the real HTTP and WebSocket paths, records release from the GM console, ARCHIVE having no record of the night until released, GM login, jump, reset, hint push (`e2e/`, Playwright).
- Live AI: with a credential set, exercise the ARCHIVE with the canonical questions (where was everyone at 2:14, tell me about Nina Calder, read the surveillance records before and after release, who did it), one hint draft before and after the release, one case report.
- Dry run on real phones before the 23rd, over cellular, through the reverse proxy, including Matt's call and the release.
