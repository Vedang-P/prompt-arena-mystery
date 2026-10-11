# The Moon’s Dark Side — Prompt Arena

A browser-based, cinematic 3D mystery. The complete authored story spans **nine acts**, **fourteen locations**, **eight animated characters**, **46 puzzles**, and two endings.

Play the release at https://prompt-arena-mystery.vercel.app/.

## Play

Choose **Enter**, then use your assigned team code. Discover evidence, decode puzzles, and question the characters. The notebook keeps every exhibit. Each chapter unlocks once its required evidence and puzzles are complete. Classroom event mode disables guest and Google entry and chapter shortcuts.

### Entry points

| Route | What it is |
| --- | --- |
| `/` | The title card: a cinematic "MIST presents" card, the wordmark over the gazebo art, a team-code dialog, a live leaderboard, and audio settings the game inherits (`client/index.html` + `client/src/site.css` / `site.js`, fonts in `client/public/fonts/`) |
| `/play/` | The game: its own 3D title screen (`Live leaderboard ↗`, `Audio & settings`, `Mute audio`, `Log out`), the team-code entry modal, then the acts |

A code accepted on the title card posts to `/api/login` and hands off to `/play/?resume=1`, which drops straight into the current act — Act 0's cinematic for a new team — instead of the game's menu.

Drag to orbit, scroll/pinch to zoom, and use WASD/arrows to move the camera. Click world markers or use **Explore this room**. Escape closes panels. Cinematics support recorded character/narrator voices, subtitles, pause, continue, skip and mute. Graphics settings support mobile and slower devices. The header provides **Log out** and **Live leaderboard**.

Outside event mode, **Chapter select** creates an independent practice save with earlier prerequisites prepared. It does not overwrite the campaign. Select **Return to campaign** to resume the original save. Event teams resume their server-side campaign with the assigned code.

## Develop

Node.js 22:

```sh
npm ci
npm run dev:game
# http://127.0.0.1:5173
```

The local single-origin server uses the same Node/Hono API as Vercel, with isolated SQLite storage. Production uses the existing Postgres connection. Local database and environment files are ignored by Git and deployment.

```sh
npm run test:engine
npm run test:campaign
npm run test:assets
npm run test:scenes
npm run test:voices
npm run test:event
npm run build
```

The engine tests cover rule enforcement. Campaign integration tests walk every act and puzzle, check prerequisite gates, both endings, all nine practice starts, wrong-answer continuation, and campaign/practice save isolation.

## Content and assets

Edit `case/parts/*.yaml`; the build merges and validates the story into generated server/client case files. Hidden answers remain in the server case. The release fragment repairs progression gates and adds readable evidence for image-dependent ciphers.

All eight principal characters use licensed Microsoft Rocketbox textured human rigs with retargeted breathing/seated animations. Detailed environments use finished CC0 Poly Haven and Innerscene models, with a published CC0 astronomy kit and some retained Kenney secondary furnishings. Blender's Python API prepares existing source models; no new character geometry is generated. All acts and authored character replies use locally recorded Kokoro-82M voices; Kevin MacLeod music ships as static MP3s. Source URLs, licenses, provenance and modifications are in `client/public/assets/ASSETS.md`, with player-facing credits at `/credits.html`.

The detailed location rebuild plan is `docs/SCENE_QUALITY_PLAN.html`. The current local rebuilds remain in review: location identity, sparse dressing, narrative actions, reused cameras and classroom-device performance need acceptance checks. Inspect all 14 environments and 62 distinct cinematic arrangements without progress writes at `http://127.0.0.1:5173/?review=scenes` with `npm run dev:game`. The review UI and local-only review API are omitted from production.

Asset regeneration downloads original sources into ignored `.asset-cache/` folders with `scripts/download-scene-assets.mjs`, `download-interior-assets.mjs`, `download-campaign-cast.mjs` and `download-astronomy-assets.mjs`. Run Blender preparation and geometry measurements before `scripts/optimize-scene-assets.mjs`; then rerun asset and staging checks. Ordinary builds use the prepared assets already in `client/public/assets/`.

Run `npm run test:scenes` for actual animated-geometry contacts and camera projection checks; `npm run test:voices` verifies coverage, encoded-duration mouth envelopes and audio hashes. Optional voice regeneration needs Python, ffmpeg and the pinned local ONNX tools:

```sh
python -m pip install --target .asset-cache/kokoro-python kokoro-onnx==0.6.1
node scripts/download-kokoro.mjs
npm run build:case
node scripts/prepare-speech.mjs
python scripts/record-campaign.py
npm run test:voices
```

The 217 recordings are already bundled; ordinary builds need neither Python nor the model. Newly authored or changed dialogue requires regeneration. The legacy `record-prologue.py` is an archived Piper workflow and should not be used to rebuild current speech.

## Deploy to Vercel

```sh
npx vercel link
npx vercel deploy --prod
```

The existing project is `prompt-arena-mystery`. Build output is `dist/`, and `api/index.js` serves the backend. Required production settings: `DATABASE_URL` (or the supported Postgres connection aliases), `SESSION_SECRET`, and `CODE_PEPPER`. Google sign-in additionally uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The current project already has these settings.

Characters use authored, evidence-grounded dialogue when no LLM key is configured. An optional OpenAI-compatible provider can be configured with the LLM environment variables; it is not needed to finish the game.

The legacy Cloudflare Worker/D1 adapter and scripts remain available for event hosting.

## Classroom event

Set EVENT_MODE=true and ALLOW_CODE_LOGIN=true. TEAM_CODES accepts comma-separated `Team name=assigned-code` entries. Guest sign-in, Google sign-in, practice starts, chapter selection and the legacy accusation shortcut are disabled in event mode. Only teams that have entered appear on the leaderboard; elapsed time starts when Act 0 finishes and Act 1 opens. Instructor preview is excluded from rankings.

The private roster is in `event-private/team-codes.csv` (70 teams) and the instructor preview code is in `event-private/instructor-code.txt`. These are ignored by Git and Vercel; distribute one assigned code per team. Production stores progress in Postgres. Music, voices and models are bundled static assets; no speech-generation calls are needed during the campaign. Run `npm run test:event` for 70 concurrent local sessions and event gate/timer checks. A classroom device/network rehearsal is still needed before the event.
