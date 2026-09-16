# Prompt Arena: Mystery — Design Doc

Status: v0.3 — decisions locked 2026-09-17. Working title; the case itself is still unnamed.
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

## 2. Design principles

Three failure modes this project is explicitly designed against:

1. **The AI must never feel bolted-on.** Suspects *are* the game: live-generated, goal-driven,
   emotional, and aware of what you have already asked. Authored Q&A exists only as an outage
   fallback — it is never the normal path.
2. **The game never grades your wording.** Interrogation is free text and nothing is
   keyword-matched. The only graded moment is the final accusation, and it is judged on
   conclusion (culprit + method + motive) with paraphrase-tolerant matching and an admin
   override.
3. **Flakiness is a design input.** Paid capacity, retries and failover, streaming, a circuit
   breaker, visible in-character "thinking" states, and a documented degradation path so the
   event can never stall.

## 3. Locked decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | **Web app, not a downloadable binary** | The LLM is core gameplay and cannot ship in a bundle; BYO laptops cannot run a local model; install/update friction at the venue is unacceptable |
| D2 | **Cloudflare Workers + D1 + Hono + React/Vite** | Global CDN for 3D assets, native SSE streaming, D1 is plenty of database for 70 teams, no server ops on event day |
| D3 | **3D rooms + click-to-talk hotspots** (not free-roam) | Vaudeville feel at a fraction of the engineering/art cost; interaction is the game |
| D4 | **Detective-first scoring**: correct solve, then earliest solve time, then fewest hints | Simple to explain, hard to cheese |
| D5 | **Gated per-NPC knowledge, server-authoritative** | Prompt injection is structurally useless: an NPC only *has* facts the team has unlocked; the solution never reaches the client or a locked prompt |
| D6 | **Single paid LLM provider** behind our own provider adapter (retries, failover, streaming, spend tracking) | Free tiers rate-limit under event load; event budget is ~$10-40; adapter stays model-agnostic so the provider can be swapped after the bake-off |
| D7 | **Text input v1; voice later** | Typing on a shared laptop fits 3-person teams; push-to-talk Whisper is a stretch goal |

## 4. System architecture

```
Browser (React + React Three Fiber)
  rooms, hotspots, interrogation panel, accusation form
        | HTTPS + SSE streaming
Cloudflare Worker (Hono)
  |- auth: team codes (HMAC cookie sessions)
  |- game state: unlock graph, clue discovery, accusations
  |- LLM pipeline: prompt build -> provider -> guardrails
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
3. Build messages = character system prompt (persona + goals + unlocked facts + exemplars +
   hard rules) + conversation memory; enqueue through the concurrency limiter; stream tokens
   back over SSE.
4. Post-checks: deny/strip anything referencing locked fact ids; log the transcript with the
   source that produced it (audit and dispute evidence).
5. Reveal conditions are evaluated **only server-side**; the client learns facts solely via
   unlocked state.

## 5. LLM and believability

Load budget: 70 teams, peak roughly **3-6 requests/second**; generation target p50 < 2s
(streaming masks latency). Free tiers (10-30 RPM shared) are 10-15x under capacity — not
usable for the event.

Pipeline, in order:

1. **Live generation** — the default and only normal path. A character's system prompt is
   stable across teams sharing an unlock set (no timestamps, no per-team text) so provider-side
   prompt caching cuts cost without changing answers.
2. **Provider adapter** — our own: model chain with retries and failover, global concurrency
   cap, per-call timeouts, streaming, token accounting.
3. **Degradation ladder** — retry -> failover model -> authored canonical answer -> in-voice
   deflect. The admin kill switch forces the bottom of the ladder.
4. **Semantic cache** (phase 2, opt-in) — only for near-verbatim repeats under peak load;
   never allowed to make a suspect feel canned.

Believability requirements (what keeps it from feeling fake):

- Each suspect has a persona, private goals, an emotional baseline, and relationships.
- Conversation memory: they remember earlier questions, hold grudges, and call back to what
  you said; near-duplicate questions are answered differently, not replayed.
- Suspects can lie, evade, deflect, get angry, or warm up — the case file defines the
  boundary between what is *true* and what they *will say*.
- Few-shot voice exemplars per character in the system prompt; ban on filler phrasing.
- Streaming makes latency read as performance; "thinking" states are in-character.

Hard rules baked into every NPC prompt: answer only from your sheet; never invent case facts;
deflect in character when the sheet has nothing; stay under N sentences; never reveal the
solution.

Pre-event: a bake-off script tests 2-3 candidate models on ~30 live interrogation prompts,
scored on tone, consistency, latency and cost, before the provider/model is finalised.

## 6. Story and content model

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
      hotspots:
        - { id: marina, type: character, character: marina_h, label: "Marina H", position: [1.2, 0, -2.0] }
        - { id: coat_rack, type: clue, clue: letter, label: "Coat rack", position: [-1.5, 0, 0.5] }
  characters:
    - id: marina_h
      persona: "..."           # voice, mannerisms, what she wants
      goals: ["protect her sister", "get her contract renewed"]
      demeanor: guarded        # how she starts; can shift during play
      facts:
        - id: marina_alibi
          text: "Claims she was on stage at 9pm."
          unlock: always
        - id: marina_letter
          text: "Received a threatening letter last week."
          unlock: { requires: [letter] }   # clue-gated knowledge
          disposition: deny      # she knows it, but will not admit it unless pressed
  clues:
    - id: letter
      name: "Threatening letter"
      description: "Unsigned, postmarked two days before the murder."
      grants: [marina_letter]
  canonical_qa:                # OUTAGE FALLBACK ONLY — never the normal path
    - character: marina_h
      q: "where were you at 9pm"
      a: "..."
```

Tooling:

- Build-time validator: every fact/clue/room referenced exists; unlock graph has no dead ends;
  the solution is reachable from the clue graph.
- Bot playthrough: a scripted interrogator that plays the whole case through the public API,
  proving it is solvable; the same harness doubles as a 70-team load test.

## 7. Scoring and leaderboard

- The accusation is a structured form: pick the culprit, describe method and motive in your
  own words. Judgment is conclusion-based — server rules plus a paraphrase-tolerant LLM judge —
  never keyword-based, and the admin can override on review. Resubmissions are allowed;
  ranking uses the first correct submission time.
- Ranking: solved teams by `solved_at`; unsolved teams by clues discovered, then fewer hints.
- Views: team screen and projector `/leaderboard`, refreshed every few seconds (SSE later).
- Anti-cheat: rate limits (minimum interval between prompts + per-team window caps),
  server-side truth, full transcript audit trail, zero solution data in the client bundle.

## 8. Event operations (BYO laptops)

- One URL + 70 team codes. **Test day**: every team opens the game once so the 3D assets are
  cached locally before the event.
- Asset budget: rooms kept under roughly 60-80 MB total; hashed filenames, immutable caching.
- Fallback for devices without usable WebGL: a visual-novel view over the same API.
- Venue wifi is the top risk. Cloud-only means the event dies with the network; a local mirror
  is on the backlog but out of scope for v1.
- Event-day runbook: to be written at M5 (start/pause, hint broadcast, kill switch, team
  reset, dispute handling).

## 9. Open questions

- LLM provider and model choice (bake-off decides)
- Case premise, cast, and writer
- How much authored canonical Q&A to pre-write for the degradation ladder
- Venue/date specifics, which drive rehearsals and the load test

## 10. Roadmap (target: event in 1-3 months)

- M1 (in progress): repo, design doc, Worker skeleton, D1 schema
- M1: auth + team codes + leaderboard shell
- M2: case schema + validator + bot playthrough; dialogue engine for 2 suspects (memory,
  goals, voice exemplars); accusation judge; model bake-off
- M3: 3D room pipeline (R3F, one room end to end), hotspot interaction, streaming chat UI
- M4: full case, hint and deadline systems, admin console
- M5: event ops: preload/test day, 70-team load test, runbook, rehearsal
