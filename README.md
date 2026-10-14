# The Moon’s Dark Side

**Prompt Arena: Mystery** — a cinematic, browser-based 3D whodunit. A student vanishes under a full moon, and every answer is buried in a room, a recording, or the person standing in front of you.

**Play it:** https://prompt-arena-mystery.vercel.app/

| The case | |
| --- | --- |
| Story | 9 acts — an opening prologue and eight playable chapters |
| Locations | 14 fully modelled rooms and outdoor sets |
| Cast | 9 animated characters |
| Content | 56 clues, 58 puzzles, 37 unlockable facts, 2 endings |
| Audio | 3 music cues, ambient beds, a diegetic cafe radio |
| Runtime | React 19 + Vite + three.js; Hono on Node 22; Postgres (SQLite in local development) |

---

## Play

Choose **Enter** on the title card, then open your case with the team code supplied to you. Each chapter unlocks only once its required evidence and puzzles are complete; the notebook keeps every exhibit, statement and resolved lead.

### Entry points

| Route | What it is |
| --- | --- |
| `/` | The title card — a cinematic “KERNEL presents” intro, the wordmark over the gazebo art, a team-code dialog, the live leaderboard, and audio settings the game inherits (`client/index.html`, `client/src/site.js`) |
| `/play/` | The game — its own 3D title screen, sign-in, then the acts (`client/play/index.html`, `client/src/App.jsx`) |

A code accepted on the title card posts to `/api/login` and hands off to `/play/?resume=1`, which drops straight into the team’s current act — Act 0’s cinematic for a new team — instead of the menu.

### Controls

| Action | Input |
| --- | --- |
| Look around | Drag / one finger |
| Zoom | Scroll / pinch |
| Move the camera | `W` `A` `S` `D` or arrow keys |
| Inspect an object | Click its marker, or use **Explore this room** |
| Close a panel | `Esc` |
| Pause a cinematic | `Space` or the on-screen controls |

Cinematics are subtitled, with pause / continue / skip / mute controls. Graphics settings cover mobile and slower classroom devices. The header carries **Live leaderboard**, **Audio & settings**, and **Log out**.

Outside event mode, **Chapter select** creates an independent practice save with the earlier prerequisites prepared; it never touches the campaign. **Return to campaign** restores the original save.

### Penalties and scoring

Every wrong answer to a puzzle costs a flat **1 penalty**. The same clue charges at most
**3 times**, so a team stuck on one puzzle can lose at most 3 points there; after that the
answer is still marked wrong but nothing more is added. Correct answers, repeat submissions
on an already-solved clue, and empty submissions cost nothing (empty answers are rejected
before scoring).

- **Score** = evidence logged + puzzles solved − penalties, and appears in the HUD, the
  notebook, the ending card and `/api/state`.
- **Reopening the case** from Act 0 costs a flat **10 penalties** in a campaign run. In
  practice it is free, and either way the event clock keeps running. A restart clears the
  per-clue wrong-answer counters but keeps the penalties already spent.
- **After an ending**, the case never loops back into itself: the title offers **Act 0 again
  with no new penalty**, or **resuming the act where the run ended** (with the earlier
  acts' evidence restored) for a heavy **25 penalties**. The clock keeps running either way.
- **Ranking**: solved teams first, by earliest solve; everyone else by score, then fewest
  penalties. The live board shows penalties, and the admin board can adjust them ±.
- Authors do not set penalties per puzzle any more — `scripts/build-case.mjs` rejects a
  `penalty:` field so every wrong answer is worth the same.

The rules are covered end-to-end by `npm run test:penalties` (fee, cap, free correct
answers, restart cost, practice, and leaderboard order) and unit-tested in
`npm run test:engine`.

---

## Develop

Requires **Node.js 22**.

```sh
npm ci
npm run dev:game
# http://127.0.0.1:5173
```

`dev:game` runs a single origin: Vite in middleware mode for the client, and the exact Vercel API entry (`api/index.js`) for `/api/*`, with an isolated SQLite file at `.game-dev.local`. No environment variables are needed locally — the server enables team-code login and falls back to development secrets on loopback hosts only.

### Project layout

```
api/index.js            Vercel Node entry — also serves local development
src/worker.js           Hono API: auth, state, discovery, interrogation, leaderboard
src/engine.js           Pure game rules (no I/O — unit-testable in plain Node)
src/case.js             Indexes the compiled case; src/generated/ is build output
lib/vercel-env.js       Runtime env + storage selection
lib/db-postgres.js      Postgres adapter (translates the worker’s SQLite-isms)
case/parts/*.yaml       Authored story fragments — edit these, never case/main.yaml
scripts/                Case build, tests, asset prep and screenshot tooling
client/src/             React app: scenes, cinematics, panels, audio
client/public/assets/   Models, textures, fonts, music
vercel.json             Build command and function configuration
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev:game` | Full local server (client + API + SQLite) |
| `npm run build` | Merge + validate the case, then build `dist/` |
| `npm run deploy:vercel` | Build and deploy to production |
| `npm run merge:case` | Merge `case/parts/*.yaml` into `case/main.yaml` |
| `npm run build:case` | Merge, validate and compile `src/generated/case.js` |
| `npm run validate:case` | Validate the compiled case without writing |
| `npm run test:engine` | Pure rule tests against a fixture case |
| `npm run test:llm` | Interrogation pool: key rotation, model failover, limits and budgets |
| `npm run test:campaign` | Full campaign walk: every act, puzzle, gate and ending |
| `npm run test:penalties` | Penalty rules end-to-end: fee, cap, restart cost, practice, leaderboard order |
| `npm run test:event` | 70 concurrent team sessions, event gates and timers |
| `npm run test:admin` | Control room: strikes, disqualification, requalification, CRUD, audit |
| `npm run test:admin-ui` | Browser smoke of the control room and fullscreen gate (needs `dev:game` running) |
| `npm run test:assets` | GLB integrity, draw budgets, surface contacts |
| `npm run test:scenes` | Actor/camera staging against measured geometry |
| `npm run test:deployment` | Hosted smoke walk (`-- https://your-deployment`) |
| `npm run shot` | Puppeteer screenshots of the running game (`shots/`) |
| `npm run gen:team` | Hash team codes for seeding |
| `npm run gen:portraits` | Re-render the interview portraits from the cast rigs (needs `dev:game` running) |

### Testing

```sh
npm run test:engine && npm run test:llm && npm run test:campaign && npm run test:penalties
npm run test:event && npm run test:assets && npm run test:scenes
npm run build
```

The engine tests cover rule enforcement, including the penalty fee and its per-clue cap. Campaign integration walks every act and puzzle, checks prerequisite gates, both endings, all nine practice starts, wrong-answer continuation, and campaign/practice save isolation. The penalty suite drives the API directly: a wrong answer costs 1, the fourth wrong answer on a clue is free, correct answers and solves are free, restarts cost 10 in campaign and nothing in practice (and reset the per-clue counters), and the leaderboard ranks by score before penalties. The scene suite decodes the actual shipped GLBs, so asset changes cannot silently drift from the staging code.

In development, `http://127.0.0.1:5173/play/?review=scenes` opens a review browser for all 14 environments and the cinematic arrangements; it never writes progress and is omitted from production.

---

## Content and assets

Edit `case/parts/*.yaml`; `npm run build:case` merges and validates the story into `case/main.yaml` and compiles `src/generated/case.js`. Hidden answers, grants and ending text remain in the server case — the client only ever receives what a team has unlocked.

All nine characters are licensed Microsoft Rocketbox textured rigs with retargeted breathing and seated animation. Environments use finished CC0 Poly Haven and Innerscene models, with a published CC0 astronomy kit and retained Kenney rugs. Blender’s Python API prepares the existing source models; no new character geometry is generated. Kevin MacLeod music ships as static MP3s.

Source URLs, licenses, provenance and modifications are catalogued in `client/public/assets/ASSETS.md`, with player-facing credits at `/credits.html`.

Asset regeneration downloads original sources into ignored `.asset-cache/` folders via `scripts/download-*.mjs`, prepares them in Blender, optimises with `scripts/optimize-scene-assets.mjs`, and re-runs the asset and staging checks. Ordinary builds need none of this.

---

## Architecture

```
Browser
  ├── /            static title card (client/src/site.js)
  └── /play/       React app (client/src/App.jsx → Scene / Cinema3D / Panels)
        │  JSON + SSE
        ▼
api/index.js       Node 22 function (Vercel) / local dev server
  └── src/worker.js  Hono routes
        ├── src/engine.js   pure rules and gates
        ├── src/llm.js      optional OpenAI-compatible adapter
        └── Postgres (DATABASE_URL)  ·  node:sqlite fallback in /tmp
```

Team progress is server-authoritative: clue discovery, puzzle answers, act gates, penalties, endings and leaderboard timing all live behind the API. Sessions are HMAC-signed cookies; team codes are stored as salted hashes. Interrogation streams over SSE and falls back through authored answers and in-character deflections when no LLM key is configured — the game is fully playable without one.

### Environment variables

Everything is optional in local development. Production needs the first three.

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Signs session cookies (required on public hosts) |
| `CODE_PEPPER` | Salts team-code hashes (required when code login is on) |
| `DATABASE_URL` | Postgres connection string (also `POSTGRES_URL`, `POSTGRES_PRISMA_URL`); without it the API falls back to per-instance `/tmp` SQLite |
| `TEAM_CODES` | `Team name=assigned-code,Another=code,…` seeded on start |
| `ALLOW_CODE_LOGIN` | Enables `POST /api/login` |
| `EVENT_MODE` | Classroom rules — see below |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | The `/admin/` control room (required in production) |
| `FULLSCREEN_ENFORCE` | Force fullscreen enforcement on/off (default: on for event mode / team-code play) |
| `EXIT_GRACE_MS` / `EXIT_MAX_STRIKES` | Grace window to return before a strike (10000); strikes before disqualification (3) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in (optional sign-in method) |
| `OPENCODE_API_KEY` / `LLM_API_KEYS` | Live AI suspects: one OpenCode Console key, or a pooled key list rotated on usage limits. Only this key is needed — the endpoint defaults to `https://opencode.ai/inference/v1` with the free model pool (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_MODELS`, `LLM_FALLBACK_MODELS` override it) |
| `LLM_FIRST_TOKEN_MS` / `LLM_TURN_BUDGET_MS` / `LLM_COOLDOWN_MS` / `LLM_MAX_CONCURRENT` / `LLM_MAX_ATTEMPTS` | Interrogation pool tuning for large events; a limited or unreachable pool falls back to the hardcoded case answers instead of stalling |

`.env.example` documents the full surface.

---

## Deploy to Vercel

```sh
npx vercel link
npx vercel deploy --prod
```

The project is `prompt-arena-mystery`. `npm run build` produces `dist/` (two Vite entry points), `vercel.json` wires `api/index.js` as the Node 22 function, and `/api/*` is rewritten to it. Health at `/api/health` reports the version and which knobs the deployment actually has configured (booleans only, never values).

A hosted smoke walk of the full campaign:

```sh
npm run test:deployment -- https://your-deployment.vercel.app [team-code]
```

---

## Classroom event

Set `EVENT_MODE=true` and `ALLOW_CODE_LOGIN=true`. `TEAM_CODES` accepts comma-separated `Team name=assigned-code` entries.

In event mode, guest and Google sign-in, practice starts, chapter selection and the accusation shortcut are disabled; only teams that have entered appear on the leaderboard, and elapsed time starts when Act 0 finishes and Act 1 opens. Instructor preview is excluded from rankings. Music and models are bundled static assets, so the campaign needs no network calls beyond the API itself.

The private roster lives in `event-private/team-codes.csv` (ignored by Git and Vercel); distribute one assigned code per team. Run `npm run test:event` for 70 concurrent local sessions and gate/timer checks, then rehearse on the actual classroom network before the event.

### Laptop requirements (publish to teams)

| | Minimum | Recommended |
| --- | --- | --- |
| Browser | Latest Chrome or Edge; Firefox 120+; Safari 16.4+ | Latest Chrome or Edge |
| Graphics | Hardware acceleration **enabled**; any GPU from ~2015 (Intel HD 5000 class) | Dedicated GPU or a modern iGPU |
| CPU / RAM | 4 threads / 4 GB (the game auto-selects Low) | 4 threads+ / 8 GB |
| Display | 1280×720 | 1920×1080 |

The game requires WebGL2. It draws even with hardware acceleration off — the browser's software rasteriser takes over — but heavy outdoor scenes drop to roughly 10 FPS that way, so teams should bring a laptop with acceleration on. **Pre-check before the event:** open the game; if the title-screen gazebo renders smoothly you are set. If the screen stays black, open `chrome://gpu` and confirm "WebGL2: Hardware accelerated" is enabled, or use another laptop. The test-day preload doubles as the compatibility check — anyone whose screen does not draw should switch laptops before the event starts.

---

## Control room (`/admin/`)

Every event deployment gets an invigilator console at **`/admin/`** — the game itself never links to it.

| What it shows | What it does |
| --- | --- |
| Live board of every team: current act, time in that act, the last act they passed and when, evidence, puzzles, penalties, hints, elapsed clock, presence (active / away / outside) | Search, filters and sorting; CSV export of the full board |
| A dedicated **Disqualified** panel: who, when, why, and their strike count | One-click requalification — reset the strikes or keep them; "clear all" emergency release; per-team manual disqualification with a reason the team sees |
| Full control per team in the drawer: rename, invigilator notes, penalties ±, jump to any act, reset the run, set strikes, enforcement exemption, delete | Admin audit log of every action, broadcast announcement bar on every team's screen |

**Fullscreen enforcement.** Event play forces fullscreen on entry and the server owns the rules: every leave (fullscreen lost, tab hidden, page unload) opens a 10-second grace window; returning in time costs nothing, missing it is one strike, and three strikes disqualify the team. A late return from a slow network is absorbed by a built-in tolerance, browsers that cannot do fullscreen report themselves and are never punished, and every team keeps a 12-hour signed admin session.

**Credentials.** `ADMIN_USERNAME` / `ADMIN_PASSWORD` on public deployments. Local development (`npm run dev:game`) falls back to:

```
username: admin
password: arena-admin
```

Public deployments without `ADMIN_PASSWORD` keep the control room locked (login returns `admin_not_configured`). Set it before the event:

```sh
npx vercel env add ADMIN_PASSWORD production
```
