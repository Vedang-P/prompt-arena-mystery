# The Moon’s Dark Side — Prompt Arena

A browser-based, cinematic 3D mystery. The complete authored story spans **nine acts**, **fourteen locations**, **eight animated characters**, **46 puzzles**, and two endings.

Play the release at https://prompt-arena-mystery.vercel.app/.

## Play

Choose **Begin investigation** for a solo save, or sign in with Google. Discover evidence, decode puzzles, and question the characters. The notebook keeps every exhibit. Each chapter unlocks once its required evidence and puzzles are complete.

Drag to orbit, scroll/pinch to zoom, and use WASD/arrows to move the camera. Click world markers or use **Explore this room**. Escape closes panels. Cinematics support subtitles, pause, continue, skip, and optional device-voice narration. Ambient audio is opt-in. Graphics settings support mobile and slower devices.

**Chapter select** creates an independent practice save with earlier prerequisites prepared. It does not overwrite the campaign. Select **Return to campaign** to resume the original save. Guest saves last 30 days in the same browser; Google saves belong to that profile.

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
npm run build
```

The engine tests cover rule enforcement. Campaign integration tests walk every act and puzzle, check prerequisite gates, both endings, all nine practice starts, wrong-answer continuation, and campaign/practice save isolation.

## Content and assets

Edit `case/parts/*.yaml`; the build merges and validates the story into generated server/client case files. Hidden answers remain in the server case. The release fragment repairs progression gates and adds readable evidence for image-dependent ciphers.

Act 0 uses licensed Microsoft Rocketbox textured human rigs, retargeted breathing/seated animations, Poly Haven park assets, and an Innerscene gazebo. Blender's Python API prepares existing source models; no new character geometry is generated. Later environments retain CC0 Kenney furniture and some stylized cast. All acts and authored character replies use locally recorded Kokoro-82M voices; Kevin MacLeod music ships as static MP3s. Source URLs, licenses and modifications are in `client/public/assets/ASSETS.md`, with player-facing credits at `/credits.html`.

The detailed location rebuild plan is `docs/SCENE_QUALITY_PLAN.html`. Those art rebuilds remain pending. Inspect every environment and cinematic without progress writes at `http://127.0.0.1:5173/?review=scenes` with `npm run dev:game`. The review UI and local-only review API are omitted from production.

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
