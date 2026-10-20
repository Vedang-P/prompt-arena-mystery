// Developer sandbox integration test: the dev account seeds from
// DEV_TEAM_CODE (POST /api/dev/login), is off the leaderboard, and
// its routes edit the dev save — while a normal account can never touch them.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arena-devtools-'));
process.env.SQLITE_PATH = path.join(directory, 'devtools.db');
process.env.EVENT_MODE = 'true';
process.env.DEV_TEAM_CODE = 'DEV-TEST-CODE';

// A previous boot with an older sandbox code must not block the current one:
// the seed realigns the stored hash with the environment, so boot once with a
// stale code before the real test boot picks up DEV-TEST-CODE.
const { spawnSync } = await import('node:child_process');
const staleBoot = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `process.env.DEV_TEAM_CODE='DEV-STALE-CODE';const {getEnv}=await import(${JSON.stringify(new URL('../lib/vercel-env.js', import.meta.url).href)});await getEnv();`,
  ],
  { env: { ...process.env, SQLITE_PATH: process.env.SQLITE_PATH }, encoding: 'utf8' }
);
assert.equal(staleBoot.status, 0, `stale seed boot failed: ${staleBoot.stderr}`);

const { default: app } = await import('../src/worker.js');
const { getEnv } = await import('../lib/vercel-env.js');
const { caseData } = await import('../src/case.js');
const env = await getEnv();

const call = (url, cookie, body) =>
  app.fetch(
    new Request('http://localhost' + url, {
      method: body ? 'POST' : 'GET',
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env
  );
const loginDev = async (code, status = 200) => {
  const res = await call('/api/dev/login', null, { code });
  assert.equal(res.status, status, `dev login ${code}`);
  return status === 200 ? res.headers.get('set-cookie').split(';')[0] : null;
};

const devCookie = await loginDev('DEV-TEST-CODE');
// The seed realigned the stale boot's hash: the old code is dead, the new one
// owns the account, and anything else is refused.
assert.equal((await loginDev('DEV-STALE-CODE', 401)) === null, true, 'the replaced sandbox code is refused');
// Players walk in as guests now — the guest account covers the "normal team".
const guest = await call('/api/guest', null, { username: 'Alpha' });
assert.equal(guest.status, 200, 'a team signs in as a guest');
const alphaCookie = guest.headers.get('set-cookie').split(';')[0];

let state = await (await call('/api/state', devCookie)).json();
assert.equal(state.dev, true, 'dev state flag');
assert.equal(state.team, 'Dev Sandbox');
assert.equal(state.practice, false);

// The catalogue carries the full registry, answers included.
const catalog = await (await call('/api/dev/catalog', devCookie)).json();
assert.equal(catalog.acts.length, caseData.acts.length);
assert.equal(catalog.rooms.length, caseData.rooms.length);
assert.equal(catalog.clues.length, caseData.clues.length);
assert.equal(catalog.puzzles.length, caseData.puzzles.length);
assert(catalog.puzzles.every((p) => Array.isArray(p.answers)), 'answers travel to dev sessions only');

// Act jump, room park, bulk reveal, single toggle, reset.
assert.equal((await call('/api/dev/act', devCookie, { act: 'act5' })).status, 200);
state = await (await call('/api/state', devCookie)).json();
assert.equal(state.act, 'act5');
assert.equal((await call('/api/dev/act', devCookie, { act: 'act99' })).status, 400, 'unknown act rejected');

assert.equal((await call('/api/dev/room', devCookie, { room: 'hospital' })).status, 200);
state = await (await call('/api/state', devCookie)).json();
assert.equal(state.devRoom, 'hospital');
assert.equal((await call('/api/dev/room', devCookie, { room: 'nowhere' })).status, 400, 'unknown room rejected');
// `{ room: null }` releases the park (the client does this when the run ends,
// so the ending card is not hidden behind the room the dev was inspecting).
assert.equal((await call('/api/dev/room', devCookie, { room: null })).status, 200);
assert.equal((await (await call('/api/state', devCookie)).json()).devRoom, null, 'null releases the parked room');
assert.equal((await call('/api/dev/room', devCookie, { room: 'hospital' })).status, 200);

// An act jump clears the parked room so the client opens the act's own entry.
assert.equal((await call('/api/dev/act', devCookie, { act: 'act3' })).status, 200);
assert.equal((await (await call('/api/state', devCookie)).json()).devRoom, null, 'act jump clears the parked room');

// Dev sessions solve and discover anything anywhere: no act gates, no requires,
// any character interviewable, and every act completable without its checklist.
assert.equal((await call('/api/dev/act', devCookie, { act: 'act1' })).status, 200);
const solvedAnywhere = await (await call('/api/puzzles/p_tablet/solve', devCookie, { answer: '1607' })).json();
assert.equal(solvedAnywhere.correct, true, 'dev solves a puzzle outside its act');
const discoveredAnywhere = await (await call('/api/clues/c_coords/discover', devCookie, {})).json();
assert(discoveredAnywhere.discovered.includes('c_coords'), 'dev discovers a clue whose requirements are unmet');
const interview = await call('/api/interrogate', devCookie, { character: 'leader', text: 'hello' });
assert.equal(interview.status, 200, 'dev interviews any character in any act');
// The sandbox may move through acts at will - the checklist is the player's
// gate, never the dev's.
const devCanAdvance = await (await call('/api/state', devCookie)).json();
assert.equal(devCanAdvance.canAdvance.ok, true, 'dev can always advance');
const completed = await (await call('/api/act/complete', devCookie, { act: 'act1' })).json();
assert.equal(completed.act, 'act2', 'dev completes an act without its checklist');

const bulk = await (await call('/api/dev/bulk', devCookie, { mode: 'all' })).json();
assert.equal(bulk.discovered.length, caseData.clues.length);
assert.equal(bulk.solvedPuzzles.length, caseData.puzzles.length);
state = await (await call('/api/state', devCookie)).json();
assert.equal(state.discovered.length, caseData.clues.length);
assert.equal(state.solvedPuzzles.length, caseData.puzzles.length);

const off = await (await call('/api/dev/toggle', devCookie, { kind: 'puzzle', id: 'p_morse', on: false })).json();
assert(!off.solvedPuzzles.includes('p_morse'));
const on = await (await call('/api/dev/toggle', devCookie, { kind: 'puzzle', id: 'p_morse', on: true })).json();
assert(on.solvedPuzzles.includes('p_morse'));
assert((await call('/api/dev/toggle', devCookie, { kind: 'clue', id: 'nope', on: true })).status === 404);

assert.equal((await call('/api/dev/penalties', devCookie, { value: 4 })).status, 200);
state = await (await call('/api/state', devCookie)).json();
assert.equal(state.penalties, 4);

assert.equal((await call('/api/dev/reset', devCookie, {})).status, 200);
state = await (await call('/api/state', devCookie)).json();
assert.equal(state.act, 'act0');
assert.equal(state.discovered.length, 0);
assert.equal(state.penalties, 0);
assert.equal(state.dev, true, 'reset keeps the dev flag');

// Finishing the case then jumping acts reopens the sandbox: the ending and
// the solve flags clear, so the dev is never trapped on the ending card.
assert.equal((await call('/api/dev/act', devCookie, { act: 'act8' })).status, 200);
const finished = await (await call('/api/act/complete', devCookie, { act: 'act8' })).json();
assert(finished.ending, 'completing the final act records the ending');
state = await (await call('/api/state', devCookie)).json();
assert.equal(state.solved, true, 'the finished run is marked solved');
assert(state.ending, 'the state carries the ending');
assert.equal((await call('/api/dev/act', devCookie, { act: 'act1' })).status, 200);
state = await (await call('/api/state', devCookie)).json();
assert.equal(state.ending, null, 'an act jump clears the recorded ending');
assert.equal(state.solved, false, 'an act jump clears the solved flag');

// The leaderboard never lists the sandbox.
await call('/api/dev/bulk', devCookie, { mode: 'all' });
await call('/api/dev/act', devCookie, { act: 'act8' });
const board = await (await call('/api/leaderboard')).json();
assert(!board.teams.some((t) => t.name === 'Dev Sandbox'), 'dev team stays off the leaderboard');

// A normal team can never reach the sandbox routes.
for (const [url, body] of [['/api/dev/catalog', null], ['/api/dev/bulk', { mode: 'all' }], ['/api/dev/reset', {}], ['/api/dev/act', { act: 'act8' }]]) {
  const res = await call(url, alphaCookie, body);
  assert.equal(res.status, 403, `${url} is dev-only`);
}
assert.equal((await call('/api/dev/catalog', null)).status, 401, 'no session, no catalogue');

console.log('PASS developer sandbox: seeded dev account, full catalogue, act/room jumps, bulk reveal, toggles, reset, leaderboard exclusion, and hard dev-only access');
process.exit(0);
