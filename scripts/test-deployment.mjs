// Hosted smoke test: plays the full campaign against a live deployment.
//
//   node scripts/test-deployment.mjs https://example.vercel.app [team-code]
//
// A deployment in event mode needs the assigned team code as the second
// argument; guest sign-in is used otherwise.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { caseData } from '../src/case.js';
import { clueGate, puzzleGate } from '../src/engine.js';

const base = process.argv[2];
assert(base?.startsWith('https://'), 'Pass the HTTPS deployment URL');
const teamCode = process.argv[3] || process.env.TEAM_CODE || '';
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const cookies = new Map();
let mode = 'campaign';
async function call(path, body, expected = 200) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-game-mode': mode, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  for (const cookie of res.headers.getSetCookie()) {
    const pair = cookie.split(';')[0];
    const at = pair.indexOf('=');
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  const data = await res.json();
  assert.equal(res.status, expected, `${path}: ${data.error ?? res.status}`);
  return data;
}
assert.equal((await call('/api/health')).version, version);
const health = await call('/api/health');
try {
  await call('/api/guest', {});
} catch (error) {
  assert(health.env?.eventMode && teamCode, 'Deployment requires a team code: pass it as the second argument');
  await call('/api/login', { code: teamCode });
}
let state = await call('/api/state');
assert.equal(state.acts.length, 9);
assert.equal(state.rooms.length, 14);
assert.equal(state.puzzles.length, 55);
await call('/api/puzzles/p_floor/solve', { answer: '3' }, 403);
await call('/api/act/complete', { act: 'act0' });
for (const act of caseData.acts.slice(1)) {
  state = await call('/api/state');
  assert.equal(state.act, act.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const room of caseData.rooms.filter((r) => act.rooms.includes(r.id))) {
      for (const h of room.hotspots) {
        if (h.act && h.act !== act.id) continue;
        if (h.type === 'clue' && !state.discovered.includes(h.clue) && clueGate(act.id, state.solvedPuzzles, state.discovered, h.clue).ok) {
          const clue = caseData.clues.find((c) => c.id === h.clue);
          if ((clue.requires ?? []).some((id) => !state.discovered.includes(id))) continue;
          await call(`/api/clues/${h.clue}/discover`, {});
          state = await call('/api/state');
          changed = true;
        }
        if (h.type === 'puzzle' && !state.solvedPuzzles.includes(h.puzzle) && puzzleGate(act.id, state.solvedPuzzles, state.discovered, h.puzzle).ok) {
          const p = caseData.puzzles.find((x) => x.id === h.puzzle);
          const result = await call(`/api/puzzles/${p.id}/solve`, { answer: p.answers?.[0] ?? 'deployment-check@example.invalid' });
          assert(result.correct, p.id);
          state = await call('/api/state');
          changed = true;
        }
      }
    }
  }
  assert(state.canAdvance.ok, `${act.id} blocked`);
  await call('/api/act/complete', { act: act.id });
  console.log(`PASS deployed ${act.id}: all required evidence and puzzles, durable save`);
}
const finished = await call('/api/state');
assert.equal(finished.solvedPuzzles.length, 54);
assert.equal(finished.penalties, 0);
assert(finished.ending?.body);
if (!health.env?.eventMode) {
  await call('/api/practice', { act: 'act7' });
  mode = 'practice';
  assert.equal((await call('/api/state')).act, 'act7');
  for (const id of ['p_mask_owner', 'p_veer_mask', 'p_lua', 'p_nigeria']) {
    const p = caseData.puzzles.find((x) => x.id === id);
    assert((await call(`/api/puzzles/${id}/solve`, { answer: p.answers[0] })).correct, id);
  }
  await call('/api/puzzles/p_continue/solve', { answer: 'Stop' });
  assert((await call('/api/state')).ending?.body);
  mode = 'campaign';
  assert.equal((await call('/api/state')).ending.id, finished.ending.id);
  console.log('PASS deployed both endings and campaign/practice save isolation');
}
const assetPaths = [
  '/assets/env/ballroom_2k.hdr',
  '/assets/furniture/rugRectangle.glb',
  ...['sameer', 'parth', 'mother', 'officer', 'veer', 'tanush', 'leader', 'enakshi', 'ramu'].map((id) => `/assets/cast/${id}.glb`),
];
for (const path of assetPaths) {
  const res = await fetch(base + path, { headers: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
  assert.equal(res.status, 200, path);
  assert(!(res.headers.get('content-type') ?? '').includes('text/html'), path);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert(bytes.length > 100, path);
  if (path.endsWith('.glb')) assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'glTF', path);
}
console.log('PASS deployed cast models, furniture and environment assets');
process.exit(0);
