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
2. Copy `.env.example` to `.env` and set `GM_PASSWORD`, `ANTHROPIC_API_KEY`, and optionally `PLAYER_KEY`.
3. Container Manager → Project → Create → pick the folder. It reads `docker-compose.yml` and builds the image.
   The first build downloads the Agent SDK binary (about 270 MB) and takes a few minutes.
4. Point your existing reverse proxy at the container's port 8080 with WebSocket support enabled
   (Synology reverse proxy: add the `Upgrade` and `Connection` custom headers, or use the WebSocket preset).
5. Open `https://your-host/gm`, log in, and walk through the configuration panel.
   Set the deli coordinates, upload the field photos and the audio clip, and check the codes.
6. The QR code in the fake book points at `https://your-host/` (or `https://your-host/?k=PLAYER_KEY` when a key is set).

Without an API key the app runs in **mock mode**: every screen works, the ARCHIVE answers from canned
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
| `ANTHROPIC_API_KEY` | (unset = mock AI) | Enables the four AI features. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for all AI features. |
| `PLAYER_KEY` | (unset = open link) | When set, the player link must be opened once with `?k=KEY`. |
| `SESSION_SECRET` | random per boot | Keeps GM logins valid across restarts. |
| `COOKIE_SECURE` | `0` | Set `1` behind https. |
| `AI_MODE` | `live` if key present | `mock` forces mock AI. |
| `PORT` | `8080` | Listen port. |
| `DATA_DIR` | `../data` (container: `/data`) | SQLite file, uploads, Agent SDK session files. |

## The night of

- The GM console shows the stage, every code and guess, ARCHIVE transcripts, and lets you jump, reset,
  seal the ARCHIVE, push hints (drafted by AI or typed), and generate the case file.
- "Reset whole game" wipes progress and logs but keeps configuration. Use it after the dry run.
- If the AI is unreachable, the ARCHIVE says the link is degraded and grading falls back to keyword matching.
  Nothing blocks the game.
- Costs: the ARCHIVE and copilot calls are short. A full evening is expected to cost a few dollars at Opus 5.5 rates.
