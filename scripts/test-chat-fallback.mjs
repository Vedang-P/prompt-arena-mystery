// The outage floor for the interview: when the model pool hangs, fails or is
// not configured at all, every character must still answer with its authored
// turn — canonical answer, snub or a cycling deflection — inside the chat
// reply budget (~10s in production; the test shrinks it via LLM_TURN_BUDGET_MS).
//
//   npm run test:chat

import assert from 'node:assert/strict';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SQLITE_PATH = join(tmpdir(), `pa-chat-${crypto.randomUUID()}.db`);
process.env.ALLOW_CODE_LOGIN = 'true';
process.env.DEV_TEAM_CODE = 'FALLBACK-TEST';
process.env.LLM_TURN_BUDGET_MS = '2000';
process.env.LLM_FIRST_TOKEN_MS = '1000';

// A stand-in pool: 'ok' answers immediately, 'hang' never answers, 'fail'
// returns a 500. The mode flips between cases.
let mode = 'hang';
const stub = http.createServer((req, res) => {
  req.resume();
  req.on('error', () => {});
  res.on('error', () => {});
  if (mode === 'fail') {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":"server_error"}');
    return;
  }
  if (mode === 'hang') return;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const part of 'Fine, I was home. '.match(/.{1,5}/gs) ?? []) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});
await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
process.env.LLM_BASE_URL = `http://127.0.0.1:${stub.address().port}/v1`;
process.env.LLM_API_KEY = 'test-key';
process.env.LLM_MODEL = 'test-model';

const { default: app } = await import('../src/worker.js');
const { getEnv } = await import('../lib/vercel-env.js');
const { caseData } = await import('../src/case.js');
const env = await getEnv();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cookies = new Map();
async function call(path, payload, useEnv = env) {
  const headers = { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') };
  if (payload !== undefined) headers['content-type'] = 'application/json';
  const res = await app.fetch(
    new Request(`http://localhost${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
    useEnv
  );
  for (const cookie of res.headers.getSetCookie()) {
    const [name, value] = cookie.split(';')[0].split('=');
    cookies.set(name, value);
  }
  return res;
}
async function ask(character, text, useEnv = env) {
  const started = Date.now();
  const res = await call('/api/interrogate', { character, text }, useEnv);
  assert.equal(res.status, 200, `${character}: interrogate must stream, got ${res.status}`);
  const raw = await res.text();
  const events = [];
  for (const block of raw.split(/\n\n+/)) {
    const lines = block.split('\n').map((line) => line.replace(/\r$/, ''));
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
    const data = lines.find((line) => line.startsWith('data:'))?.slice(5).trim();
    if (event && data) events.push({ event, data: JSON.parse(data) });
  }
  return { events, elapsed: Date.now() - started };
}

await call('/api/login', { code: 'FALLBACK-TEST' });
const state = await call('/api/state').then((res) => res.json());
assert.equal(state.dev, true, 'the fallback test needs the dev sandbox team');
assert.equal(state.act, 'act0');

const characters = caseData.characters.map((ch) => ch.id);
assert.equal(characters.length, 9, 'the case must keep its nine characters');
for (const ch of caseData.characters) {
  assert(ch.deflections?.length >= 2, `${ch.id} needs authored deflection lines for the outage ladder`);
  assert(ch.snubs?.length >= 1, `${ch.id} needs at least one snub`);
}

// A live model that answers is still preferred: the deadline must not disturb
// the happy path.
mode = 'ok';
{
  const { events, elapsed } = await ask('mother', 'did you call parth that evening');
  const deltas = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  assert.match(deltas, /Fine, I was home/, 'a live reply must stream its deltas');
  const done = events.find((e) => e.event === 'done');
  assert.equal(done?.data.source, 'llm', 'a finished live reply must be kept');
  assert(elapsed < 2000, `the live reply took ${elapsed}ms`);
}

// The pool hangs: every character must answer from the authored ladder inside
// the reply budget, with no dead air.
mode = 'hang';
for (const characterId of characters) {
  await sleep(1600);
  const { events, elapsed } = await ask(characterId, 'where were you that night');
  const meta = events.find((e) => e.event === 'meta');
  const reset = events.find((e) => e.event === 'reset');
  const done = events.find((e) => e.event === 'done');
  assert.equal(meta?.data.live, true, `${characterId}: the hung pool must still be reported live`);
  assert(reset?.data.text, `${characterId}: a fallback reply must arrive when the pool hangs`);
  assert.equal(done?.data.source, 'deflect', `${characterId}: the hung turn must fall back to a deflection`);
  const ch = caseData.characters.find((c) => c.id === characterId);
  const ladder = [...(ch.deflections_by_act?.act0 ?? []), ...(ch.deflections ?? [])];
  assert(ladder.includes(reset.data.text), `${characterId}: the fallback must be one of its authored lines`);
  assert(elapsed < 5000, `${characterId}: the fallback took ${elapsed}ms — the interview must not stall`);
  const history = await call(`/api/characters/${characterId}/history`).then((res) => res.json());
  const stored = history.messages.filter((m) => m.role === 'npc').at(-1);
  assert.equal(stored?.content, reset.data.text, `${characterId}: the fallback must be stored in the transcript`);
  assert.equal(stored?.source, 'deflect', `${characterId}: the stored source must match the fallback`);
}

// A broken pool (5xx) degrades the same way, quickly.
mode = 'fail';
{
  await sleep(1600);
  const { events, elapsed } = await ask('officer', 'any news on the case');
  const done = events.find((e) => e.event === 'done');
  assert.equal(done?.data.source, 'deflect', 'a 5xx pool must fall back to the authored turn');
  assert(elapsed < 3000, `the 5xx fallback took ${elapsed}ms`);
}

// No pool at all (no keys configured): the authored turn is the only voice.
{
  await sleep(1600);
  const bare = { ...env, LLM_BASE_URL: '', LLM_API_KEY: '', LLM_API_KEYS: '', OPENCODE_API_KEY: '', OPENCODE_GO_API_KEY: '', OPENCODE_GO_API_KEYS: '' };
  const { events, elapsed } = await ask('ramu', 'what did parth order', bare);
  const meta = events.find((e) => e.event === 'meta');
  const reset = events.find((e) => e.event === 'reset');
  const done = events.find((e) => e.event === 'done');
  assert.equal(meta?.data.live, false, 'an unconfigured pool must report not-live');
  assert.equal(done?.data.source, 'canonical', 'the scripted answer must land without a pool');
  assert.match(reset?.data.text ?? '', /Masala dosa/, 'the canonical answer must reach the transcript');
  assert(elapsed < 1500, `the unconfigured fallback took ${elapsed}ms`);
}

stub.close();
console.log(`PASS chat fallback: ${characters.length} characters answer from the authored ladder when the pool hangs, fails or is unconfigured.`);
