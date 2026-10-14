// Reproduce the Act IV hospital skip: walk the campaign to act4, then do only
// the hospital steps the screenshot shows and check whether the act can advance.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.SQLITE_PATH = join(tmpdir(), `act4-skip-${crypto.randomUUID()}.db`);
const { default: app } = await import('../src/worker.js');
const { getEnv } = await import('../lib/vercel-env.js');
const { caseData } = await import('../src/case.js');
const { puzzleGate, clueGate } = await import('../src/engine.js');
const env = await getEnv();
const cookies = new Map();
async function call(path, payload, expected = 200) {
  const headers = { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') };
  if (payload !== undefined) headers['content-type'] = 'application/json';
  const res = await app.fetch(new Request(`http://localhost${path}`, { method: payload === undefined ? 'GET' : 'POST', headers, body: payload === undefined ? undefined : JSON.stringify(payload) }), env);
  for (const cookie of res.headers.getSetCookie()) { const [name, value] = cookie.split(';')[0].split('='); cookies.set(name, value); }
  const json = await res.json();
  if (expected !== null) console.log(res.status === expected ? 'ok ' : 'BAD', path, res.status, JSON.stringify(json).slice(0, 220));
  return { status: res.status, json };
}
const solveAll = async (act) => {
  let state = (await call('/api/state', undefined, 200)).json;
  let changed = true;
  while (changed) {
    changed = false;
    for (const room of caseData.rooms.filter((r) => act.rooms.includes(r.id))) {
      for (const h of room.hotspots) {
        if (h.act && h.act !== act.id) continue;
        if (h.type === 'clue' && !state.discovered.includes(h.clue) && clueGate(act.id, state.solvedPuzzles, state.discovered, h.clue).ok) {
          const clue = caseData.clues.find((c) => c.id === h.clue);
          if ((clue.requires ?? []).some((id) => !state.discovered.includes(id))) continue;
          await call(`/api/clues/${h.clue}/discover`, {}, null);
          state = (await call('/api/state', undefined, null)).json; changed = true;
        }
        if (h.type === 'puzzle' && !state.solvedPuzzles.includes(h.puzzle) && puzzleGate(act.id, state.solvedPuzzles, state.discovered, h.puzzle).ok) {
          const p = caseData.puzzles.find((p) => p.id === h.puzzle);
          await call(`/api/puzzles/${p.id}/solve`, { answer: p.answers?.[0] ?? 'detective@example.invalid' }, null);
          state = (await call('/api/state', undefined, null)).json; changed = true;
        }
      }
    }
  }
  return state;
};
await call('/api/guest', {});
await call('/api/act/complete', { act: 'act0' });
for (const act of caseData.acts.slice(1, 4)) {
  const state = await solveAll(act);
  console.log('act', act.id, 'canAdvance', JSON.stringify(state.canAdvance.missing));
  await call('/api/act/complete', { act: act.id });
}
let state = (await call('/api/state', undefined, 200)).json;
console.log('now in', state.act, 'complete', JSON.stringify(caseData.acts.find((a) => a.id === state.act).complete));
const report = async (tag) => {
  state = (await call('/api/state', undefined, null)).json;
  console.log(tag, 'canAdvance.ok', state.canAdvance.ok, 'missing', JSON.stringify(state.canAdvance.missing));
};
await report('fresh act4');
console.log('-- hospital only --');
await call('/api/clues/c_janitor/discover', {});
await report('after janitor');
await call('/api/puzzles/p_security_pin/solve', { answer: 'star' });
await report('after security pin');
await call('/api/puzzles/p_parth_alive/solve', { answer: 'parth' });
await report('after parth alive');
const complete = await call('/api/act/complete', { act: 'act4' }, 200);
console.log('act4 complete status', complete.status, '->', complete.json.act);
