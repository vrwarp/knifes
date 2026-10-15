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

## Run it on the Synology NAS

1. Copy this repo to a shared folder on the NAS, for example `docker/section30`.
2. Copy `.env.example` to `.env` and set `GM_PASSWORD`, one Claude credential (see below), and optionally `PLAYER_KEY`.
3. Container Manager → Project → Create → pick the folder. It reads `docker-compose.yml` and builds the image.
   The first build downloads the Agent SDK binary (about 270 MB) and takes a few minutes.
4. Point your existing reverse proxy at the container's port 8080 with WebSocket support enabled
   (Synology reverse proxy: add the `Upgrade` and `Connection` custom headers, or use the WebSocket preset).
5. Open `https://your-host/gm`, log in, and walk through the configuration panel.
   Set the deli coordinates, upload the field photos and the audio clip, and check the codes.
6. The QR code in the fake book points at `https://your-host/` (or `https://your-host/?k=PLAYER_KEY` when a key is set).

## Use your Claude subscription instead of an API key

The AI features run through the Claude Agent SDK, which spawns the Claude Code binary bundled in
the image. That binary authenticates the same way Claude Code does on your laptop, so your Pro or Max
subscription works without an API key. Three ways to give it a credential, in the order Claude Code
prefers them when more than one is present:

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
