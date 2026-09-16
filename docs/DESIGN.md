# Prompt Arena: Mystery — Design Doc

Status: v0.2 — decisions locked 2026-09-17. Working title; the case itself is still unnamed.
Standalone design: no game code or mechanics are derived from earlier Prompt Arena editions.

## 1. Concept

A live, single-session whodunit for **70 teams x 3 players** on a **3-hour** clock. Every team
investigates the **same case**: explore 3D rooms, question AI-driven suspects in natural
language (typing), find clues, and accuse the culprit. A **live leaderboard** ranks teams by
who solves it first. Only the organiser sees the truth.

The LLM is the game: every suspect conversation is generated live and grounded in a
server-authoritative case file. There is no keyword matching, no scripted dialogue tree, and
no deterministic answer engine to satisfy yourself against — if you can say it to a suspect,
they can respond to it.

## 2. Locked decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | **Web app, not a downloadable binary** | The LLM is core gameplay and cannot ship in a bundle; BYO laptops cannot run a local model; install/update friction at the venue is unacceptable |
| D2 | **Cloudflare Workers + D1 + Hono + React/Vite** | Global CDN for 3D assets, native SSE streaming, D1 is plenty of database for 70 teams, no server ops on event day |
| D3 | **3D rooms + click-to-talk hotspots** (not free-roam) | Vaudeville feel at a fraction of the engineering/art cost; interaction is the game |
| D4 | **Detective-first scoring**: correct solve, then earliest solve time, then fewest hints | Simple to explain, hard to cheese |
| D5 | **Gated per-NPC knowledge, server-authoritative** | Prompt injection is structurally useless: an NPC only *has* facts the team has unlocked; the solution never reaches the client or a locked prompt |
| D6 | **Single paid LLM provider** behind our own provider adapter (retries, failover, streaming, spend tracking) | Free tiers rate-limit under event load; event budget is ~$10-40; adapter stays model-agnostic so the provider can be swapped after the bake-off |
| D7 | **Text input v1; voice later** | Typing on a shared laptop fits 3-person teams; push-to-talk Whisper is a stretch goal |

## 3. System architecture

```
Browser (React + React Three Fiber)
  rooms, hotspots, interrogation panel, accusation form
        | HTTPS + SSE streaming
Cloudflare Worker (Hono)
  |- auth: team codes (HMAC cookie sessions)
  |- game state: unlock graph, clue discovery, accusations
  |- LLM pipeline: prompt build -> cache -> provider -> guardrails
  |- scoring + leaderboard API (projector + team views)
  +- admin console (pause, hints, broadcasts, kill switch)
        |
  D1 (SQLite)                Workers assets (3D scenes on CDN)
  teams, progress,           built client + compressed .glb room assets
  messages, events, config
        |
  LLM provider (OpenAI-compatible /chat/completions)
```

Message flow for one interrogation:

1. Client POSTs `{character, text}` with the team's session cookie.
2. Worker loads the team's `progress.unlocked` set — **the only facts this NPC may know**.
3. Canonical Q&A cache: if the question matches an authored Q&A for this character and unlock
   set, stream the scripted answer (no LLM call).
4. Otherwise: build messages = character system prompt (persona + unlocked facts + hard rules)
   + recent transcript; enqueue through the concurrency limiter; stream tokens back over SSE.
5. Post-checks: deny/strip anything referencing locked fact ids; log the transcript with the
   rule/source that fired (audit and dispute evidence).
6. Reveal conditions are evaluated **only server-side**; the client learns facts solely via
   unlocked state.

## 4. LLM strategy

Load budget: 70 teams, peak roughly **3-6 requests/second**; generation target p50 < 2s
(streaming masks latency). Free tiers (10-30 RPM shared) are 10-15x under capacity — not
usable for the event.

Layers, in order of use:

1. **Canonical Q&A per character** — authored questions map to scripted answers. Cache-first.
   Also the fallback when the provider is down.
2. **Prompt caching** — a character's system prompt is identical for all teams sharing an
   unlock set; keep it stable (no timestamps, no per-team text) so provider-side caching hits.
3. **Semantic cache** (phase 2) — normalize and embed incoming questions; serve near-duplicates.
4. **Provider adapter** — model chain with retries and failover, global concurrency cap,
   per-call timeouts, token accounting, streaming.
5. **Kill switch** — admin flips NPCs to canonical-only mode if the provider degrades mid-event.

Hard rules baked into every NPC prompt: answer only from your fact sheet; never invent case
facts; deflect in character when the sheet has nothing; stay under N sentences; never reveal
the solution.

Pre-event: a bake-off script tests 2-3 candidate models on ~20 canonical questions, scored on
tone, consistency, latency and cost, before the provider/model is finalised.

## 5. Story and content model

Content is the critical path — start writing immediately.

```yaml
case:
  title: "working title"
  solution:                    # SERVER-ONLY. Never sent to client or to a locked prompt.
    culprit: character_id
    method: "..."
    motive: "..."
  rooms:
    - id: dressing_room
      name: "Dressing Room"
      scene: dressing_room.glb
      hotspots: [marina_h, vanity_mirror, coat_rack]
  characters:
    - id: marina_h
      persona: "..."           # voice, mannerisms, what she wants
      facts:
        - id: marina_alibi
          text: "Claims she was on stage at 9pm."
          topics: [alibi, "9pm", stage]
          unlock: always
        - id: marina_letter
          text: "Received a threatening letter last week."
          unlock: { requires: [clue_letter_found] }
  clues:
    - id: clue_letter_found
      where: { room: dressing_room, hotspot: coat_rack }
      grants: [marina_letter]
  canonical_qa:                # cache-first answers per character (also offline fallback)
    - character: marina_h
      q: "where were you at 9pm"
      a: "..."
```

Tooling:

- Build-time validator: every fact/clue/room referenced exists; unlock graph has no dead ends;
  the solution is reachable from the clue graph.
- Bot playthrough: a scripted interrogator that plays the whole case through the public API,
  proving it is solvable; the same harness doubles as a 70-team load test.

## 6. Scoring and leaderboard

- A team is **solved** when its accusation matches the solution (culprit + method + motive),
  checked server-side. An LLM judge may paraphrase-match free-form accusations; admin can
  override.
- Ranking: solved teams by `solved_at`; unsolved teams by clues discovered, then fewer hints.
- Views: team screen and projector `/leaderboard`, refreshed every few seconds (SSE later).
- Anti-cheat: rate limits (minimum interval between prompts + per-team window caps),
  server-side truth, full transcript audit trail, zero solution data in the client bundle.

## 7. Event operations (BYO laptops)

- One URL + 70 team codes. **Test day**: every team opens the game once so the 3D assets are
  cached locally before the event.
- Asset budget: rooms kept under roughly 60-80 MB total; hashed filenames, immutable caching.
- Fallback for devices without usable WebGL: a visual-novel view over the same API.
- Venue wifi is the top risk. Cloud-only means the event dies with the network; a local mirror
  is on the backlog but out of scope for v1.
- Event-day runbook: to be written at M5 (start/pause, hint broadcast, kill switch, team
  reset, dispute handling).

## 8. Open questions

- LLM provider and model choice (bake-off decides)
- Case premise, cast, and writer
- Keep token spend on the leaderboard as a non-ranking "style stat" (fun, not ranking)?
- Venue/date specifics, which drive rehearsals and the load test

## 9. Roadmap (target: event in 1-3 months)

- M1 (in progress): repo, design doc, Worker skeleton, D1 schema
- M1: auth + team codes + leaderboard shell
- M2: case schema + validator + bot playthrough; dialogue engine for 2 characters; model bake-off
- M3: 3D room pipeline (R3F, one room end to end), hotspot interaction, streaming chat UI
- M4: full case, hint and deadline systems, admin console
- M5: event ops: preload/test day, 70-team load test, runbook, rehearsal
