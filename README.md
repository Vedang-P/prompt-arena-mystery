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

The 3D environments use bundled CC0 Kenney furniture and animated character rigs. Each character has an original procedural face and wardrobe, independent animation, lighting, and shadows. No remote model service or missing Mixamo files are required. Attribution is in `client/public/assets/ATTRIBUTION.md`.

## Deploy to Vercel

```sh
npx vercel link
npx vercel deploy --prod
```

The existing project is `prompt-arena-mystery`. Build output is `dist/`, and `api/index.js` serves the backend. Required production settings: `DATABASE_URL` (or the supported Postgres connection aliases), `SESSION_SECRET`, and `CODE_PEPPER`. Google sign-in additionally uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The current project already has these settings.

Characters use authored, evidence-grounded dialogue when no LLM key is configured. An optional OpenAI-compatible provider can be configured with the LLM environment variables; it is not needed to finish the game.

The legacy Cloudflare Worker/D1 adapter and scripts remain available for event hosting.
