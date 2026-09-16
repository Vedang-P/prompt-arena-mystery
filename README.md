# Prompt Arena: Mystery

Working title. A live AI-interrogation whodunit: **70 teams x 3 players, 3 hours, one shared
case, one live leaderboard**. Teams explore 3D rooms and question AI suspects by typing; the
organiser watches the truth from an admin console.

The LLM is the game here: every interrogation is generated live and grounded in a
server-authoritative case file. Nothing in this design derives from earlier Prompt Arena
editions; no game code or mechanics carry over.

## Status

Playable local demo: one 3D scene with two rooms, two AI suspects, clue discovery,
cross-character knowledge, an accusation flow and a win condition. The real event case is
still to come.

## Stack

Cloudflare Workers + D1 + Hono - React 19 + Vite + React Three Fiber (3D rooms) -
OpenAI-compatible LLM behind a fallback chain

## Layout

```
docs/DESIGN.md      the plan: architecture, LLM strategy, scoring, event ops
docs/EXCHANGE.md    one play session, call by call
case/smoke.yaml     the demo case (replace with the real one)
src/                Worker API + game engine (server-only)
client/             game UI + 3D scene (React Three Fiber)
scripts/            case compiler/validator, team generator, engine tests
```

## Play locally

```bash
npm install
npm run db:local     # schema + demo team into local D1
npm run build        # client -> dist/
npm run dev          # open http://127.0.0.1:8787

# demo team code: PANDA-7K2
```

Without an LLM key the suspects answer from the authored fallback ladder and the header
badge says so. To enable live AI suspects, create `.dev.vars` (see `.dev.vars.example`) and
fill in `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

## Develop

```bash
npm run dev:web       # Vite HMR on :5173, proxies /api to :8787
npm run test:engine   # unit tests for the game rules
npm run validate:case # validate case/smoke.yaml without compiling
npm run gen:team -- "TEAM-042" PANDA-7K2   # emit seed SQL for a new team code
```

## How a game works

- Clues found in rooms unlock **facts**; facts are what suspects are allowed to know.
  Cross-character chains work through `unlock: { after: [other_fact] }` in the case file.
- Suspicion is authorable: each fact carries a disposition (`admit` / `deny` / `deflect`).
- The final accusation is judged on conclusion (culprit + method + motive), and the case can
  require specific evidence (`solution.required_clues`) before an accusation is accepted.

## Deploy

```bash
npx wrangler d1 create prompt-arena-mystery-db   # paste id into wrangler.jsonc
npm run db:remote
npx wrangler secret put SESSION_SECRET
npx wrangler secret put CODE_PEPPER
npx wrangler secret put LLM_API_KEY
npm run deploy
```
