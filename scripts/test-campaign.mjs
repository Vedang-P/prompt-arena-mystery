import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.SQLITE_PATH = join(tmpdir(), `moon-test-${crypto.randomUUID()}.db`);
const { default: app } = await import('../src/worker.js');
const { getEnv } = await import('../lib/vercel-env.js');
const { caseData } = await import('../src/case.js');
const { chapterCheckpoint, canAdvanceAct, puzzleGate, clueGate } = await import('../src/engine.js');
const env = await getEnv();
for (const [act,solved,discovered,puzzle,missingClue] of [
  ['act1',[],['c_diary'],'p_morse','c_laptop_locked'],
  ['act3',['p_registration'],[],'p_fare','c_workshop_address'],
  ['act4',['p_security_pin'],[],'p_parth_alive','c_cameras'],
  ['act5',['p_tablet'],['c_handbook'],'p_knowledge','c_enakshi'],
  ['act5',['p_knowledge','p_tablet'],['c_handbook'],'p_tablet_content','c_tablet_data'],
  ['act7',['p_veer_mask'],[],'p_nigeria','c_lua_files'],
]) {
  const gate=puzzleGate(act,solved,discovered,puzzle);
  assert.equal(gate.error,'locked',`${puzzle} must wait for its narrative clue`);
  assert(gate.missing.clues.includes(missingClue),`${puzzle} must name missing clue ${missingClue}`);
}
assert(clueGate('act5',[],[],'c_enakshi').ok,'Enakshi encounter must be available on entering the house');
const cookies = new Map();
let mode = 'campaign';
async function call(path, payload, expected = 200) {
  const headers = { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), 'x-game-mode': mode };
  if (payload !== undefined) headers['content-type'] = 'application/json';
  const res = await app.fetch(new Request(`http://localhost${path}`, { method: payload === undefined ? 'GET' : 'POST', headers, body: payload === undefined ? undefined : JSON.stringify(payload) }), env);
  for (const cookie of res.headers.getSetCookie()) { const [name, value] = cookie.split(';')[0].split('='); cookies.set(name, value); }
  const json = await res.json();
  assert.equal(res.status, expected, `${path}: ${JSON.stringify(json)}`);
  return json;
}
await call('/api/guest', {});
let state = await call('/api/state');
assert.equal(state.act, 'act0');
assert.equal(state.acts.length, 9);
assert.equal(state.rooms.length, 14);
assert.equal(state.puzzles.length, 58);
assert(state.puzzles.every((p) => !('answers' in p) && !('grants' in p)));
// The arrest cinematic must hand the player to the station, not back to the room.
assert.equal(state.puzzles.find((p) => p.id === 'p_taken_in')?.lands_in, 'police_station');
const act6Rooms = caseData.acts.find((a) => a.id === 'act6')?.rooms ?? [];
assert(act6Rooms.includes('police_station'), 'the arrest landing must be one of the act rooms');
assert(state.endings.every((e) => !('body' in e)));
await call('/api/puzzles/p_floor/solve', { answer: '3' }, 403);
await call('/api/act/complete', { act: 'act4' }, 409);
await call('/api/act/complete', { act: 'act0' });
await call('/api/act/complete', { act: 'act1' }, 409);
await call('/api/puzzles/p_laptop/solve', { answer: 'oc1808' }, 403);
for (const act of caseData.acts.slice(1)) {
  state = await call('/api/state');
  assert.equal(state.act, act.id);
  let changed = true;
  let actions = 0;
  while (changed) {
    changed = false;
    for (const room of caseData.rooms.filter((r) => act.rooms.includes(r.id))) {
      for (const h of room.hotspots) {
        if (h.act && h.act !== act.id) continue;
        if (h.type === 'clue' && !state.discovered.includes(h.clue) && clueGate(act.id, state.solvedPuzzles, state.discovered, h.clue).ok) {
          const clue = caseData.clues.find((c) => c.id === h.clue);
          if ((clue.requires ?? []).some((id) => !state.discovered.includes(id))) continue;
          await call(`/api/clues/${h.clue}/discover`, {});
          state = await call('/api/state'); changed = true; actions++;
        }
        if (h.type === 'puzzle' && !state.solvedPuzzles.includes(h.puzzle) && puzzleGate(act.id, state.solvedPuzzles, state.discovered, h.puzzle).ok) {
          const p = caseData.puzzles.find((p) => p.id === h.puzzle);
          const result = await call(`/api/puzzles/${p.id}/solve`, { answer: p.answers?.[0] ?? 'detective@example.invalid' });
          assert(result.correct, p.id);
          state = await call('/api/state'); changed = true; actions++;
        }
      }
    }
  }
  assert(state.canAdvance.ok, `${act.id} blocked: ${JSON.stringify(state.canAdvance)}`);
  const repeatTarget = (act.complete?.puzzles ?? [])[0] ?? state.solvedPuzzles[0];
  const repeated = await call(`/api/puzzles/${repeatTarget}/solve`, { answer: 'already answered' });
  assert(repeated.alreadySolved);
  await call('/api/act/complete', { act: act.id });
  console.log(`PASS ${act.id}: ${actions} interactions, all completion gates reachable`);
}
state = await call('/api/state');
assert.equal(state.ending.id, 'ending_main');
assert.match(state.ending.body, /now disappear/i);
// 57 of 58: the café route skips p_cd_watch, which only exists on the laptop path.
assert.equal(state.solvedPuzzles.length, 57);
assert.equal(state.penalties, 0);
assert.equal(state.score, state.discovered.length + 57);
const campaignSave = JSON.stringify(state);
for (const act of caseData.acts) {
  mode = 'campaign';
  await call('/api/practice', { act: act.id });
  mode = 'practice';
  const rehearsal = await call('/api/state');
  assert.equal(rehearsal.act, act.id);
  assert(rehearsal.practice);
  const checkpoint = chapterCheckpoint(act.id);
  assert.deepEqual(rehearsal.discovered, checkpoint.discovered);
  for (const prior of caseData.acts.slice(1, caseData.acts.indexOf(act))) {
    assert(canAdvanceAct(checkpoint.solvedPuzzles, checkpoint.discovered, prior.id).ok, `Practice ${act.id} loses ${prior.id} evidence`);
  }
  console.log(`PASS practice ${act.id}: independent save with prerequisite evidence`);
}
mode = 'campaign';
await call('/api/practice', { act: 'act7' });
mode = 'practice';
await call('/api/puzzles/p_mask_owner/solve', { answer: 'leader' });
await call('/api/puzzles/p_veer_mask/solve', { answer: 'mask' });
const stop = await call('/api/puzzles/p_continue/solve', { answer: 'Stop' });
assert.equal(stop.ending, 'ending_cult');
assert.equal((await call('/api/state')).ending.id, 'ending_cult');
const leaderboard = await call('/api/leaderboard');
assert(!leaderboard.teams.some((t) => t.name.startsWith('Practice-')));
mode = 'campaign';
const preserved = await call('/api/state');
assert.equal(preserved.team, JSON.parse(campaignSave).team);
assert.equal(preserved.ending.id, 'ending_main');
assert.equal(preserved.solvedPuzzles.length, 57);
console.log('PASS both endings, practice isolation, durable reload, score, and leaderboard');
// A finished run must never loop back into its ending: resuming reopens the act
// it ended on (prior acts restored from the practice checkpoint) for the heavy
// resume penalty, and a full Act 0 restart after an ending is free.
const resumed = await call('/api/restart', { from: 'recent' });
assert.equal(resumed.penalty, 25);
assert.equal(resumed.act, 'act8');
let reopened = await call('/api/state');
assert.equal(reopened.act, 'act8');
assert.equal(reopened.ending, null);
assert.equal(reopened.solved, false);
assert.equal(reopened.penalties, 25);
assert.deepEqual(reopened.discovered, chapterCheckpoint('act8').discovered);
assert.deepEqual(reopened.solvedPuzzles, chapterCheckpoint('act8').solvedPuzzles);
// Both natural endings are already covered above; force the ending back on to
// prove the free Act 0 restart is gated on a finished run.
await env.DB.prepare(
  "UPDATE progress SET act = 'act7', ending = 'ending_cult', solved = 1 WHERE team_id = (SELECT id FROM teams WHERE name = ?)"
).bind(JSON.parse(campaignSave).team).run();
const free = await call('/api/restart', { from: 'act0' });
assert.equal(free.penalty, 0, 'a restart after an ending is free');
reopened = await call('/api/state');
assert.equal(reopened.act, 'act0');
assert.equal(reopened.ending, null);
assert.equal(reopened.solved, false);
assert.deepEqual(reopened.discovered, []);
assert.equal(reopened.penalties, 25, 'a free restart keeps the penalties already spent');
console.log('PASS post-ending restart: free Act 0 or resume the ending act for 25');
// The laptop path must not skip the cyber cafe: it fries the laptop and the
// footage only arrives once the CD is played at Ramu's.
await call('/api/guest', {});
await call('/api/practice', { act: 'act2' }); mode = 'practice';
await call('/api/puzzles/p_voicenote2/solve', { answer: 'park' });
await call('/api/clues/c_cd/discover', {});
const wrong = await call('/api/puzzles/p_cd_mode/solve', { answer: 'Use my laptop' });
assert(!wrong.correct); assert.equal(wrong.penalty, 1); assert.equal(wrong.totalPenalties, 1);
assert.equal(wrong.penaltyCap, 3);
assert(wrong.discovered.includes('c_laptop_fried'), 'the fried laptop must be recorded');
assert(!wrong.discovered.includes('c_footage'), 'the laptop path must not grant the videos');
const watch = await call('/api/puzzles/p_cd_watch/solve', { answer: 'Insert the CD' });
assert(watch.correct && watch.penalty === 0 && watch.discovered.includes('c_footage'), 'the cyber cafe must deliver the videos');
console.log('PASS the laptop path forces the cyber cafe before the videos');
console.log('Campaign integration checks passed.');
process.exit(0);
