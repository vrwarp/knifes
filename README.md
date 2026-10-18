# Section 30: The Director's Last File

Phone web app and game-master console for Jimmy's thirtieth-birthday murder mystery.
One Node server hosts both, keeps state in SQLite, and uses the Claude Agent SDK for the
in-world ARCHIVE terminal, GM hint drafting, free-text deduction grading and the closing case file.

Full requirements and design: [docs/SPEC.md](docs/SPEC.md).

## What is in here

| Path | What |
| - | - |
| `server/` | Node 22 + TypeScript. Express API, WebSocket push, SQLite (`node:sqlite`), Claude Agent SDK. |
| `client/` | Vite + React. Player app at `/`, GM console at `/gm`. |
| `Dockerfile`, `docker-compose.yml` | One container for the NAS. Data lives in `./data`. |
| `docs/SPEC.md` | Decisions, flow, content, API and test plan. |

The word puzzle is a race by default: each round draws a five-letter word from a bank of ten keys (editable
in the GM console, with the adversary's script for each written when you save) and an AI opponent plays the same word on a timer, one attempt every 10 seconds give or take 5,
slowing by half again after each round it wins. By default `claude-sonnet-5-5` scripts each round in
advance, 8 ± 2 guesses to the key, so the difficulty is a number; a live turn-by-turn style is available. Jimmy sees the opponent's attempts on a second board and has to find the key first; when the opponent wins, the next word starts at once.
Attempts are unlimited by default, so a round ends only when one side finds the word. When the adversary has
taken all ten keys, a configurable free pass lets Jimmy through with an in-world excuse.
Pace, model, attempt cap, word bank, letter visibility and a classic solo mode are all in **Game configuration → Word puzzle**.
Without a Claude credential the opponent is a deterministic solver, so the race still runs in mock mode.

## Run it on the Synology NAS

1. Copy this repo to a shared folder on the NAS, for example `docker/section30`.
2. Copy `.env.example` to `.env` and set `GM_PASSWORD`, one Claude credential (see below), and optionally `PLAYER_KEY`
   and `GOOGLE_MAPS_API_KEY` (a Maps JavaScript API browser key; with it the location puzzle embeds Street View).
3. Container Manager → Project → Create → pick the folder. It reads `docker-compose.yml` and builds the image.
   The first build downloads the Agent SDK binary (about 270 MB) and takes a few minutes.
4. Point your existing reverse proxy at the container's port 8080 with WebSocket support enabled
   (Synology reverse proxy: add the `Upgrade` and `Connection` custom headers, or use the WebSocket preset).
5. Open `https://your-host/gm`, log in, and walk through the configuration panel.
   Set the deli coordinates (Street View starts there unless you give it its own spot), upload the
   audio clip, and check the codes. Without a Maps key, upload field photos instead.
6. The QR code in the fake book points at `https://your-host/` (or `https://your-host/?k=PLAYER_KEY` when a key is set).

## Use your Claude subscription instead of an API key

The AI features run through the Claude Agent SDK, which spawns the Claude Code binary bundled in
the image. That binary authenticates the same way Claude Code does on your laptop, so your Pro or Max
subscription works without an API key.

**Easiest: sign in from the GM console.** Open `/gm`, find the **Claude link** panel (top right while
the AI is not linked), press **Sign in with Claude**, open the link, approve on Claude's site, and paste
the code it shows back into the panel. **Test connection** then sends one tiny request to prove it
answers. The login is stored in the data volume and survives restarts and image updates; **Sign out**
removes it. This is the same flow as FanZiTong's: the server runs `claude auth login` in the
background and hands it the pasted code, so nobody needs a shell in the container. The GM password
protects it. It only works while no credential is set in the container's environment, because those
outrank a login.

The other ways to give it a credential, in the order Claude Code prefers them when more than one is
present:

1. **`ANTHROPIC_API_KEY`** in `.env`. Per-token billing from platform.claude.com. Wins over the others.
2. **`CLAUDE_CODE_OAUTH_TOKEN`** in `.env`. Run `claude setup-token` on any machine with Claude Code,
   approve in the browser, paste the printed token. Lasts a year. This is the recommended NAS setup.
3. **Sign in inside the container** once it is running: `docker compose exec section30 claude auth login`,
   then paste the code the browser shows. The login is written to `/data/claude/.credentials.json`
   in the data volume and survives restarts. Check it with `docker compose exec section30 claude auth status`.

The GM console's top bar shows which credential Claude Code found, and the container log prints the
same at boot. That is a local presence check, not a call to the API: the first ARCHIVE query is the
real test, so run one in rehearsal. With no credential the app runs in mock mode.

Two things to know about the subscription route. Anthropic's docs say the token "authenticates with
your Claude subscription and requires a Pro, Max, Team, or Enterprise plan", and that third-party
developers may not offer claude.ai login or rate limits in their products; this setup is the
personal-use shape of that rule, your login on your NAS for your own party, so do not hand the
container to other people. Subscription usage limits also apply: if the plan's window runs out
mid-evening, the ARCHIVE answers "link degraded", the grader falls back to keyword matching, and the
GM log shows an `ai_error` naming the limit. An API key in `.env` is the fallback if that happens.

Without a credential the app runs in **mock mode**: every screen works, the ARCHIVE answers from canned
lookups, grading is keyword based, hints come from the quick-hint lists. Good for rehearsals.

## Setup assistant and configuration history

**Setup assistant.** The GM console has a chat with Opus for getting the game ready. Ask what is
still missing, have it check the field photos, brainstorm red herrings or hint wording, or draft
printable props like the drop-point card. It reads the live configuration, the case files and the
uploaded photos. A readiness list at the top shows blockers such as a missing target pin or photos.
The assistant never edits anything itself. A change comes back as a proposal showing each setting's
current and new value, and nothing happens until a GM presses **Apply**. Opus can read images but
cannot make them, so for photos it describes what to shoot and reviews what you upload. In mock
mode it shows the readiness list and accepts simple edits such as `set gate.code to "PHIL2026"`.
Its messages go only to GMs, never to the player's phone.

**Configuration history.** The configuration is append-only. Every change adds a new numbered
version, whether it comes from a GM save, an upload, an applied proposal or a restore. Database
triggers refuse to edit or delete an old version. Under **Version history** in the config editor,
open any version to see what restoring it would change, then press **Restore**. A restore adds a
copy of that version as the newest one, so it can be undone the same way. Removing a photo or the
audio takes it out of the game but keeps the file, so older versions still restore completely.

## Run it locally

```bash
cd server && npm install && npm run dev        # API on :8080, data in ../data
cd client && npm install && npm run dev        # Vite on :5173, proxies to :8080
```

Set `GM_PASSWORD=test` (and `ANTHROPIC_API_KEY` if you want live AI) in the shell before `npm run dev`.
Open http://localhost:5173 for the player and http://localhost:5173/gm for the console.

Checks:

```bash
cd server && npm run typecheck && npm test
cd client && npm run build
```

## Environment variables

| Variable | Default | Meaning |
| - | - | - |
| `GM_PASSWORD` | (unset = console disabled) | Password for `/gm`. |
| `CLAUDE_CODE_OAUTH_TOKEN` | (unset) | Subscription token from `claude setup-token`. Enables live AI. |
| `ANTHROPIC_API_KEY` | (unset) | API key. Enables live AI and outranks the subscription token. |
| `CLAUDE_CONFIG_DIR` | `/data/claude` in the container | Where a `claude auth login` is stored and SDK sessions live. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for all AI features. |
| `PLAYER_KEY` | (unset = open link) | When set, the player link must be opened once with `?k=KEY`. |
| `SESSION_SECRET` | random per boot | Keeps GM logins valid across restarts. |
| `COOKIE_SECURE` | `0` | Set `1` behind https. |
| `AI_MODE` | `auto` | `mock` forces mock AI; otherwise live whenever a credential is found. |
| `PORT` | `8080` | Listen port. |
| `DATA_DIR` | `../data` (container: `/data`) | SQLite file, uploads, Agent SDK session files. |

## The night of

- The GM console shows the stage, every code and guess, ARCHIVE transcripts, and lets you jump, reset,
  seal the ARCHIVE, push hints (drafted by AI or typed), and generate the case file.
- "Reset whole game" wipes progress and logs but keeps configuration. Use it after the dry run.
- If the AI is unreachable, the ARCHIVE says the link is degraded and grading falls back to keyword matching.
  Nothing blocks the game.
- Costs: the ARCHIVE and copilot calls are short. A full evening is expected to cost a few dollars at Opus 5.5 rates.

### Continuous integration and Docker Hub

Four GitHub Actions workflows live in `.github/workflows`:

| Workflow | Runs on | What it does |
| - | - | - |
| `ci.yml` | every pull request and every push to `main` | Typechecks and unit-tests the server and builds the client. This is the check that gates the Docker Hub publish. |
| `e2e.yml` | every pull request and every push to `main` | Runs the Playwright suite in two parallel jobs (Chromium and WebKit, each at phone and desktop size) and uploads the reports. Informational: it never blocks a merge or a Docker Hub push. |
| `docker-dry-run.yml` | pull requests only | Builds the image for `linux/amd64` without pushing, boots it, and checks `/healthz`, the player API and the bundled `claude` binary. |
| `docker-publish.yml` | after CI passes on a push to `main` (a merge) | Builds and pushes `latest` and `sha-<commit>` tags to Docker Hub, whatever the browser tests say. Can also be started by hand from the Actions tab. |

If you add a branch protection rule for `main`, require the `CI` and `Docker dry run` checks only, not the `E2E` ones, so a failing browser test never blocks a merge.

Before the first merge, add these under Settings > Secrets and variables > Actions:

- Secret `DOCKERHUB_USERNAME`: your Docker Hub user name.
- Secret `DOCKERHUB_TOKEN`: a Docker Hub access token with Read & Write scope.
- Variable `DOCKERHUB_REPO` (optional): the image name, for example `yourname/section30`. Defaults to `<username>/section30`.

On the NAS, point Container Manager at that image and pull `latest` after each merge.

### End-to-end tests

The Playwright suite in `e2e/tests` runs every test on four projects: Chromium and WebKit, each at
phone and desktop size. Each worker starts its own server with a private data directory and mock AI,
and map tiles are stubbed, so the suite needs no network or Claude login.

```
cd server && npm run build && cd ../client && npm run build
cd ../e2e && npm install && npx playwright install chromium webkit
npm test                  # all four projects
npm run test:chromium     # Chromium phone and desktop only
npm run test:webkit       # WebKit phone and desktop only
npx playwright show-report output/report
```

On Linux, WebKit also needs its system libraries once: `npx playwright install-deps webkit`.
Set `PW_CHROMIUM` or `PW_WEBKIT` to a browser executable to use one Playwright did not install.

Coverage: the full player journey; the three location modes and target radius; the code gate; the
word puzzle scoring, lockout and reset; every evidence file; passcode vault mode; ARCHIVE answers,
persistence and sealing; deduction drafts, the verdict delay, pass/fail and count feedback; hints
(overlay focus, Escape, transmissions list, quick hints, AI drafts); the GM console (login, stuck
alarms with a mocked clock, skips and jumps with confirmations, stage and whole-game resets, log
filters, case report publishing, config editing, validation, concurrent-edit warning); the player
key; API authorization; secret leakage; connection-loss banners and polling; and layout checks for
sideways scroll, 16px inputs and 44px touch targets.

### Visual walkthrough

`node e2e/walkthrough.mjs` drives the real app through every player and GM journey (default run,
location modes, word-puzzle lockout, passcode vault, GM console, link and access problems) and
writes screenshots, two screencast videos and a `manifest.json` to `e2e/output/walkthrough/`.
Videos are encoded with the system `ffmpeg`.
