// Penalty system integration tests: a wrong answer costs 1, a clue charges at
// most 3, correct answers and solved clues are free, restarts cost 10 in an
// event run and nothing in practice, and the leaderboard ranks by score before
// penalties. Runs against a throwaway SQLite database.
//   npm run test:penalties
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.SQLITE_PATH = join(tmpdir(), `moon-penalty-${crypto.randomUUID()}.db`);
const { default: app } = await import('../src/worker.js');
const { getEnv } = await import('../lib/vercel-env.js');
const env = await getEnv();

function client() {
  const cookies = new Map();
  let mode = 'campaign';
  return {
    get mode() { return mode; },
    set mode(value) { mode = value; },
    async call(path, payload, expected = 200) {
      const headers = { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'x-game-mode': mode };
      if (payload !== undefined) headers['content-type'] = 'application/json';
      const res = await app.fetch(
        new Request(`http://localhost${path}`, {
          method: payload === undefined ? 'GET' : 'POST',
          headers,
          body: payload === undefined ? undefined : JSON.stringify(payload),
        }),
        env
      );
      for (const cookie of res.headers.getSetCookie()) {
        const [name, value] = cookie.split(';')[0].split('=');
        cookies.set(name, value);
      }
      const json = await res.json();
      assert.equal(res.status, expected, `${path}: ${JSON.stringify(json)}`);
      return json;
    },
  };
}

async function openAct1(c) {
  await c.call('/api/guest', {});
  await c.call('/api/act/complete', { act: 'act0' });
  const before = await c.call('/api/state');
  assert.equal(before.act, 'act1');
  // The laptop is the first clue; the diary opens once it is logged.
  await c.call('/api/clues/c_laptop_locked/discover', {});
  await c.call('/api/clues/c_diary/discover', {});
}

// ---- Team A: the wrong-answer fee, its cap, and a free correct answer ----

const A = client();
await openAct1(A);

const wrong1 = await A.call('/api/puzzles/p_morse/solve', { answer: '0000' });
assert.equal(wrong1.correct, false);
assert.equal(wrong1.penalty, 1, 'a wrong answer costs exactly 1');
assert.equal(wrong1.totalPenalties, 1);
assert.equal(wrong1.wrongCharges, 1);
assert.equal(wrong1.penaltyCap, 3);

const wrong2 = await A.call('/api/puzzles/p_morse/solve', { answer: '1111' });
assert.equal(wrong2.penalty, 1);
assert.equal(wrong2.totalPenalties, 2);

const wrong3 = await A.call('/api/puzzles/p_morse/solve', { answer: '2222' });
assert.equal(wrong3.penalty, 1);
assert.equal(wrong3.totalPenalties, 3);

const wrong4 = await A.call('/api/puzzles/p_morse/solve', { answer: '3333' });
assert.equal(wrong4.correct, false, 'a capped wrong answer still resolves as wrong');
assert.equal(wrong4.penalty, 0, 'the fourth wrong answer on a clue is free');
assert.equal(wrong4.totalPenalties, 3);
assert.equal(wrong4.wrongCharges, 4);

const correct = await A.call('/api/puzzles/p_morse/solve', { answer: 'oc1808' });
assert.equal(correct.correct, true);
assert.equal(correct.penalty, 0, 'a correct answer never charges');
assert.equal(correct.totalPenalties, 3);

const afterCorrect = await A.call('/api/puzzles/p_morse/solve', { answer: 'not the answer' });
assert.equal(afterCorrect.alreadySolved, true);
assert.equal(afterCorrect.penalty, 0, 'repeat submissions on a solved clue are free');

await A.call('/api/puzzles/p_laptop/solve', { answer: '   ' }, 400);
await A.call('/api/puzzles/p_laptop/solve', { answer: 'oc1808' });

const stateA = await A.call('/api/state');
assert.equal(stateA.penalties, 3);
assert.equal(stateA.score, stateA.discovered.length + stateA.solvedPuzzles.length - 3);

// ---- Team B: same progress, no penalties, restart costs ----

const B = client();
await openAct1(B);
await B.call('/api/puzzles/p_morse/solve', { answer: 'oc1808' });
const stateB = await B.call('/api/state');
assert.equal(stateB.penalties, 0);

// The leaderboard ranks by score first, so the clean team leads a team that
// holds identical evidence but carries penalties.
const board = await A.call('/api/leaderboard');
const names = board.teams.map((t) => t.name);
assert(names.indexOf(stateB.team) < names.indexOf(stateA.team), `${stateB.team} should outrank ${stateA.team}: ${names}`);
assert.equal(board.teams.find((t) => t.name === stateA.team).penalties, 3);

// A campaign restart costs a flat 10.
const restarted = await B.call('/api/restart', {});
assert.equal(restarted.penalty, 10);
assert.equal(restarted.penalties, 10);
const afterRestart = await B.call('/api/state');
assert.equal(afterRestart.act, 'act0');
assert.equal(afterRestart.penalties, 10);

// ---- Practice: restarts are free and wrong-answer counters reset ----

B.mode = 'campaign';
await B.call('/api/practice', { act: 'act1' });
B.mode = 'practice';
const practiceState = await B.call('/api/state');
assert.equal(practiceState.act, 'act1');
assert.equal(practiceState.practice, true);
await B.call('/api/clues/c_laptop_locked/discover', {});
await B.call('/api/clues/c_diary/discover', {});
const p1 = await B.call('/api/puzzles/p_morse/solve', { answer: 'nope' });
const p2 = await B.call('/api/puzzles/p_morse/solve', { answer: 'nope again' });
const p3 = await B.call('/api/puzzles/p_morse/solve', { answer: 'still nope' });
assert.deepEqual([p1.penalty, p2.penalty, p3.penalty], [1, 1, 1]);
assert.equal(p3.totalPenalties, 3);

const practiceRestart = await B.call('/api/restart', {});
assert.equal(practiceRestart.penalty, 0, 'practice restarts are free');
assert.equal(practiceRestart.penalties, 3, 'the restarted run keeps what it already spent');

await B.call('/api/act/complete', { act: 'act0' });
await B.call('/api/clues/c_laptop_locked/discover', {});
await B.call('/api/clues/c_diary/discover', {});
const backToWork = await B.call('/api/puzzles/p_morse/solve', { answer: 'nope once more' });
assert.equal(backToWork.penalty, 1, 'a restart resets the per-clue wrong-answer counter');
assert.equal(backToWork.totalPenalties, 4);

const practiceBoard = await A.call('/api/leaderboard');
assert(!practiceBoard.teams.some((t) => t.name.startsWith('Practice-')), 'practice teams stay off the public board');

console.log('Penalty integration checks passed.');
process.exit(0);
