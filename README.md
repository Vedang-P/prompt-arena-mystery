# Prompt Arena: Mystery

Working title. A live AI-interrogation whodunit: **70 teams x 3 players, 3 hours, one shared
case, one live leaderboard**. Teams explore 3D rooms and question AI suspects by typing; the
organiser watches the truth from an admin console.

Next edition of [prompt-arena](https://github.com/Vedang-P/prompt-arena) — the deterministic
CRT-terminal challenge that ran 150+ players. This game reuses that proven Cloudflare stack
with a new LLM-first gameplay model.

## Status

Design phase. Decisions locked (`docs/DESIGN.md`); skeleton deployable; no gameplay yet.

## Stack

Cloudflare Workers + D1 + Hono - React 18 + Vite - React Three Fiber (3D rooms) -
OpenAI-compatible LLM behind a fallback chain

## Layout

```
docs/DESIGN.md    the plan: architecture, LLM strategy, scoring, event ops
src/worker.js     API (Hono) — auth, game state, LLM pipeline, leaderboard
client/           game UI (React + R3F)
schema.sql        D1 schema
```

## Local dev

```bash
npm install
npm run db:local    # schema into local D1
npm run build       # client -> dist/
npm run dev         # wrangler dev on http://127.0.0.1:8787

npm run dev:web     # Vite HMR on http://localhost:5173 (proxies /api)
```

## Deploy

```bash
npx wrangler d1 create prompt-arena-mystery-db   # paste id into wrangler.jsonc
npm run db:remote
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put LLM_API_KEY
npm run deploy
```
