// Event-scale chat stress test. Fires N simulated teams at the real model pool
// at once, wave after wave, and reports the player-facing outcome: every call
// either streams a live reply or lands on the authored fallback — a team is
// never left without an answer.
//
//   npm run test:stress                      100 teams, 2 waves, real pool
//   npm run test:stress -- --teams 100 --waves 2 --gap 1500
//
// Needs OPENCODE_API_KEY (or LLM_* variables) in the environment.

import { buildMessages, canonicalAnswer, chapterCheckpoint, deflection, isNoise } from '../src/engine.js';
import { makeLLM, llmConfigured } from '../src/llm.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]) || fallback;
};
const TEAMS = arg('teams', 100);
const WAVES = arg('waves', 2);
const GAP_MS = arg('gap', 1500);

if (!llmConfigured(process.env)) {
  console.log('test:stress skipped — set OPENCODE_API_KEY (or LLM_* variables) to run it.');
  process.exit(0);
}

const CAST = [
  { character: 'mother', act: 'act1' },
  { character: 'ramu', act: 'act2' },
  { character: 'veer', act: 'act3' },
  { character: 'officer', act: 'act6' },
];
const QUESTIONS = [
  ['Hello, how are you holding up?', 'Did you call Parth that evening?', 'What did Parth usually order?', 'Do you know Parth?', 'Can we file a missing report now?'],
  ['Where did he go after that?', 'Was he acting strange lately?', 'Have you seen him around?', 'What do the workshops do?', 'I have evidence. Will you look at it?'],
];

const events = new Map();
const allEvents = [];
const llm = makeLLM(process.env, (event) => {
  allEvents.push({ ...event, at: Date.now() });
  if (event.session && (event.type === 'llm_ok' || event.type === 'llm_error')) events.set(event.session, event);
});

const checkpoints = new Map();
const checkpointFor = (act) => {
  if (!checkpoints.has(act)) checkpoints.set(act, chapterCheckpoint(act).discovered);
  return checkpoints.get(act);
};

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

const runCall = async (team, wave) => {
  const scene = CAST[team % CAST.length];
  const question = QUESTIONS[wave % QUESTIONS.length][team % QUESTIONS[wave % QUESTIONS.length].length];
  const session = `stress-team-${team}-${scene.character}`;
  const discovered = checkpointFor(scene.act);
  const started = Date.now();
  events.delete(session);
  let firstDelta = null;
  let text = '';
  let error = null;
  try {
    for await (const delta of llm.stream(
      buildMessages(scene.character, discovered, [], question, scene.act),
      { session, maxTokens: 320, budgetMs: 30000 }
    )) {
      if (firstDelta === null) firstDelta = Date.now() - started;
      text += delta;
    }
  } catch (e) {
    error = String(e?.message ?? e);
  }
  const ms = Date.now() - started;
  const event = events.get(session);
  if (error || !text.trim()) {
    const fallback = canonicalAnswer(scene.character, question) ?? deflection(scene.character, team + 1, false, scene.act);
    return {
      team,
      wave,
      live: false,
      fallback: Boolean(fallback?.trim()),
      error: error ?? 'empty',
      ms,
      firstDelta,
      keyIndex: event?.keyIndex ?? null,
    };
  }
  return {
    team,
    wave,
    live: true,
    fallback: false,
    error: null,
    ms,
    firstDelta,
    keyIndex: event?.keyIndex ?? null,
  };
};

console.log(`stress: ${TEAMS} teams x ${WAVES} waves, gap ${GAP_MS}ms, ${process.env.LLM_MAX_CONCURRENT ?? 'default'} concurrency`);
const results = [];
for (let wave = 0; wave < WAVES; wave += 1) {
  const started = Date.now();
  const settled = await Promise.all(Array.from({ length: TEAMS }, (_, team) => runCall(team, wave)));
  results.push(...settled);
  const live = settled.filter((r) => r.live).length;
  const errors = {};
  for (const r of settled) if (r.error) errors[r.error] = (errors[r.error] ?? 0) + 1;
  const keys = {};
  for (const r of settled) if (r.keyIndex !== null) keys[r.keyIndex] = (keys[r.keyIndex] ?? 0) + 1;
  console.log(
    `wave ${wave + 1}: live=${live}/${TEAMS} fallback=${TEAMS - live} wall=${Date.now() - started}ms` +
      ` errors=${JSON.stringify(errors)} keys=${JSON.stringify(keys)}`
  );
  if (wave < WAVES - 1) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
}

const answered = results.filter((r) => r.live || r.fallback).length;
const liveTimes = results.filter((r) => r.live).map((r) => r.ms).sort((a, b) => a - b);
const firsts = results.filter((r) => r.live && r.firstDelta !== null).map((r) => r.firstDelta).sort((a, b) => a - b);
const keyUsage = {};
for (const r of results) if (r.keyIndex !== null) keyUsage[r.keyIndex] = (keyUsage[r.keyIndex] ?? 0) + 1;
const errorTypes = {};
for (const event of allEvents) {
  if (event.type === 'llm_error') {
    const key = `${event.detail ?? 'unknown'}${event.retryAfterMs ? ` (retry ${Math.round(event.retryAfterMs / 1000)}s)` : ''}`;
    errorTypes[key] = (errorTypes[key] ?? 0) + 1;
  }
}
const attempts = allEvents.filter((e) => e.type === 'llm_ok' || e.type === 'llm_error').length;
console.log(`\nanswers delivered: ${answered}/${results.length} (authored fallback: ${results.length - liveTimes.length})`);
console.log(`live latency total: p50=${percentile(liveTimes, 0.5)}ms p95=${percentile(liveTimes, 0.95)}ms max=${liveTimes.at(-1) ?? 0}ms`);
console.log(`live first token:   p50=${percentile(firsts, 0.5)}ms p95=${percentile(firsts, 0.95)}ms`);
console.log(`attempts: ${attempts} (ok ${allEvents.filter((e) => e.type === 'llm_ok').length}), errors: ${JSON.stringify(errorTypes)}`);
console.log(`key usage: ${JSON.stringify(keyUsage)}`);
const failures = results.filter((r) => !r.live && !r.fallback);
if (failures.length) {
  console.error(`FAIL  ${failures.length} player-facing failures (no live reply and no fallback)`);
  process.exit(1);
}
console.log('every simulated team received an answer.');
