// Control-room integration test: admin auth, fullscreen strike accounting,
// disqualification, requalification, exemptions, announcements, audit, export
// and team CRUD — all through the real worker routes, against fresh SQLite.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arena-admin-'));
process.env.SQLITE_PATH = path.join(directory, 'admin.db');
process.env.EVENT_MODE = 'true';
process.env.ALLOW_CODE_LOGIN = 'true';
process.env.ADMIN_PASSWORD = 'test-admin';
process.env.TEAM_CODES = 'Alpha=ALPHA-1,Bravo=BRAVO-2,Charlie=CHARLIE-3';

const { default: app } = await import('../src/worker.js');
const { getEnv } = await import('../lib/vercel-env.js');
const env = await getEnv();

const request = (url, cookie, body, method) =>
  app.fetch(
    new Request('http://localhost' + url, {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env
  );

const start = performance.now();

// ---- admin auth ----
const badLogin = await request('/api/admin/login', null, { username: 'admin', password: 'nope' });
assert.equal(badLogin.status, 401);
const login = await request('/api/admin/login', null, { username: 'admin', password: 'test-admin' });
assert.equal(login.status, 200);
const adminCookie = login.headers.get('set-cookie').split(';')[0];
const session = await (await request('/api/admin/session', adminCookie)).json();
assert.equal(session.authed, true);
assert.equal(session.fullscreen, true);
assert.equal(session.maxStrikes, 3);
assert.equal(session.graceMs, 10000);
assert.equal((await request('/api/admin/overview', null)).status, 401);
assert.equal((await request('/api/admin/overview', 'pa_admin=forged')).status, 401);

// ---- team config sees enforcement ----
const config = await (await request('/api/auth/config')).json();
assert.equal(config.fullscreen, true);
assert.equal(config.maxStrikes, 3);
assert.equal(config.windowMs, 12000, 'the enforced window is grace plus tolerance');

// ---- sign in two teams ----
const loginTeam = async (code) => {
  const res = await request('/api/login', null, { code });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
};
const alphaCookie = await loginTeam('ALPHA-1');
const bravoCookie = await loginTeam('BRAVO-2');
const alphaRow = await env.DB.prepare("SELECT id FROM teams WHERE name = 'Alpha'").first();

let overview = await (await request('/api/admin/overview', adminCookie)).json();
assert.equal(overview.teams.length, 3);
assert.equal(overview.stats.total, 3);
let alpha = overview.teams.find((t) => t.id === alphaRow.id);
assert.equal(alpha.name, 'Alpha');
assert.equal(alpha.act, 'act0');
assert.equal(alpha.lastPassedAct, null);
assert.equal(alpha.penalties, 0);
assert.equal(alpha.strikes, 0);
assert.equal(alpha.disqualified, false);

// ---- fine-grained grace accounting ----
// Readiness: a fresh exit + immediate return is not a strike.
const firstExit = await (await request('/api/fullscreen/exit', alphaCookie, { kind: 'fullscreen' })).json();
assert.equal(firstExit.enforced, true);
assert.equal(firstExit.graceMs, 10000);
assert.equal(firstExit.windowMs, 12000);
assert(Date.parse(firstExit.deadline) > Date.now() + 11_000, 'the deadline is the full enforced window');
let ret = await (await request('/api/fullscreen/return', alphaCookie, undefined, 'POST')).json();
assert.equal(ret.ok, true);
assert.equal(ret.late, false);
assert.equal(ret.strikes, 0);

// Inside the tolerance window (11s) a slow return must never strike.
const pending = (iso) =>
  env.DB.prepare('UPDATE teams SET pending_exit_at = ?, pending_exit_kind = ? WHERE id = ?')
    .bind(iso, 'fullscreen', alphaRow.id)
    .run();
await pending(new Date(Date.now() - 11_000).toISOString());
ret = await (await request('/api/fullscreen/return', alphaCookie, undefined, 'POST')).json();
assert.equal(ret.late, false, '11s return is inside the 10s + 2s tolerance');
assert.equal(ret.strikes, 0);

// Clearly late (30s) is a strike.
await pending(new Date(Date.now() - 30_000).toISOString());
ret = await (await request('/api/fullscreen/return', alphaCookie, undefined, 'POST')).json();
assert.equal(ret.late, true);
assert.equal(ret.strikes, 1);
assert.equal(ret.disqualified, false);

// A heartbeat while the team is outside must never settle the exit — the
// verdict belongs to the return, where the player is shown it.
await pending(new Date(Date.now() - 30_000).toISOString());
const hb = await (await request('/api/heartbeat', alphaCookie, undefined, 'POST')).json();
assert.equal(hb.strikes, 1, 'heartbeat reports the count without settling');
const stillOut = await env.DB.prepare('SELECT pending_exit_at FROM teams WHERE id = ?').bind(alphaRow.id).first();
assert(stillOut.pending_exit_at, 'the pending exit survives a heartbeat');

// A tab close with no return settles lazily on the next request.
await pending(new Date(Date.now() - 60_000).toISOString());
const state = await request('/api/state', alphaCookie);
assert.equal(state.status, 200);
const stateJson = await state.json();
assert.equal(stateJson.strikes, 2);
assert.equal(stateJson.fullscreen, true);
assert.equal(stateJson.team, 'Alpha');

// Third strike disqualifies.
await pending(new Date(Date.now() - 60_000).toISOString());
const blocked = await request('/api/state', alphaCookie);
assert.equal(blocked.status, 403);
const blockedJson = await blocked.json();
assert.equal(blockedJson.error, 'disqualified');
assert.equal(blockedJson.strikes, 3);
assert.equal(blockedJson.maxStrikes, 3);

// The public leaderboard drops disqualified teams; the admin board keeps them.
let leaderboard = await (await request('/api/leaderboard')).json();
assert(leaderboard.teams.every((t) => t.name !== 'Alpha'));
assert(leaderboard.teams.some((t) => t.name === 'Bravo'));
overview = await (await request('/api/admin/overview', adminCookie)).json();
alpha = overview.teams.find((t) => t.id === alphaRow.id);
assert.equal(alpha.disqualified, true);
assert.equal(alpha.strikes, 3);
assert.equal(alpha.disqualifyReason, 'left_fullscreen');
assert.equal(overview.stats.disqualified, 1);
assert((await request('/api/fullscreen/exit', alphaCookie, { kind: 'fullscreen' })).status === 403);
// Every game route is closed to a disqualified team, not just /api/state.
assert.equal((await request('/api/clues/c_diary/discover', alphaCookie, {})).status, 403);
assert.equal((await request('/api/puzzles/p_morse/solve', alphaCookie, { answer: 'x' })).status, 403);
assert.equal((await request('/api/interrogate', alphaCookie, { character: 'parth', text: 'hello' })).status, 403);

// ---- requalification ----
const requalify = await (await request(`/api/admin/teams/${alphaRow.id}/requalify`, adminCookie, { resetStrikes: true })).json();
assert.equal(requalify.ok, true);
assert.equal(requalify.strikes, 0);
const back = await (await request('/api/state', alphaCookie)).json();
assert.equal(back.strikes, 0);
leaderboard = await (await request('/api/leaderboard')).json();
assert(leaderboard.teams.some((t) => t.name === 'Alpha'));

// Two racing returns must never double-count one exit.
await pending(new Date(Date.now() - 30_000).toISOString());
const [cr1, cr2] = await Promise.all([
  request('/api/fullscreen/return', alphaCookie, undefined, 'POST').then((r) => r.json()),
  request('/api/fullscreen/return', alphaCookie, undefined, 'POST').then((r) => r.json()),
]);
assert(Math.max(cr1.strikes ?? 0, cr2.strikes ?? 0) <= 1, 'a racing return counts at most one strike');
const afterRace = await (await request('/api/state', alphaCookie)).json();
assert.equal(afterRace.strikes, 1, 'exactly one strike recorded after the race');
await request(`/api/admin/teams/${alphaRow.id}/requalify`, adminCookie, { resetStrikes: true });

// ---- exemptions are never struck ----
const charlieCookie = await loginTeam('CHARLIE-3');
const charlieRow = await env.DB.prepare("SELECT id FROM teams WHERE name = 'Charlie'").first();
await request(`/api/admin/teams/${charlieRow.id}/exempt`, adminCookie, { exempt: true });
const exemptExit = await (await request('/api/fullscreen/exit', charlieCookie, { kind: 'fullscreen' })).json();
assert.equal(exemptExit.exempt, true);
await pending(new Date(Date.now() - 90_000).toISOString());
const charlieState = await (await request('/api/state', charlieCookie)).json();
assert.equal(charlieState.strikes, 0);
assert.equal(charlieState.exempt, true);

// ---- full admin control ----
const penalties = await (await request(`/api/admin/teams/${alphaRow.id}/penalties`, adminCookie, { delta: 7 })).json();
assert.equal(penalties.penalties, 7);
await request(`/api/admin/teams/${alphaRow.id}/penalties`, adminCookie, { delta: -20 });
const floor = await env.DB.prepare('SELECT penalties FROM progress WHERE team_id = ?').bind(alphaRow.id).first();
assert.equal(Number(floor.penalties), 0);

const stage = await (await request(`/api/admin/teams/${alphaRow.id}/stage`, adminCookie, { act: 'act3' })).json();
assert.equal(stage.act, 'act3');
const stageState = await (await request('/api/state', alphaCookie)).json();
assert.equal(stageState.act, 'act3');

// ---- teleports carry the acts behind them ----
assert(stageState.discovered.length > 0, 'a teleport grants the clues of the acts behind it');
assert(stageState.discovered.includes('c_laptop_locked'), 'an Act 1 clue arrives when teleported to Act 3');
assert.equal(stageState.discovered.length, stage.discovered);
const stage8 = await (await request(`/api/admin/teams/${alphaRow.id}/stage`, adminCookie, { act: 'act8' })).json();
assert(stage8.discovered > stage.discovered, 'a later teleport grants the acts in between');
const stage8State = await (await request('/api/state', alphaCookie)).json();
assert.equal(stage8State.act, 'act8');
assert(stage8State.discovered.length === stage8.discovered, 'the full checkpoint is live for the team');
assert(stage8State.discovered.includes('c_laptop_locked'), 'earlier grants survive a further teleport');

const rename = await (await request(`/api/admin/teams/${alphaRow.id}/rename`, adminCookie, { name: 'Alpha Prime' })).json();
assert.equal(rename.name, 'Alpha Prime');
const clash = await request(`/api/admin/teams/${alphaRow.id}/rename`, adminCookie, { name: 'Bravo' });
assert.equal(clash.status, 409);

const note = await (await request(`/api/admin/teams/${alphaRow.id}/note`, adminCookie, { text: 'projector hiccup at 10:12' })).json();
assert.equal(note.note, 'projector hiccup at 10:12');

const bravoRow = await env.DB.prepare("SELECT id FROM teams WHERE name = 'Bravo'").first();
const manualDq = await request(`/api/admin/teams/${bravoRow.id}/disqualify`, adminCookie, { reason: 'left the room' });
assert.equal(manualDq.status, 200);
const bravoState = await request('/api/state', bravoCookie);
assert.equal(bravoState.status, 403);
const bravoDq = await bravoState.json();
assert.equal(bravoDq.reason, 'left the room');
await request(`/api/admin/teams/${bravoRow.id}/requalify`, adminCookie, { resetStrikes: false });

// ---- strikes and reset run ----
const strikes = await (await request(`/api/admin/teams/${alphaRow.id}/strikes`, adminCookie, { strikes: 2 })).json();
assert.equal(strikes.strikes, 2);
const reset = await (await request(`/api/admin/teams/${alphaRow.id}/reset`, adminCookie, { penalty: 5 })).json();
assert.equal(reset.penalties, 5);
const resetTeam = await (await request(`/api/admin/teams/${alphaRow.id}`, adminCookie)).json();
assert.equal(resetTeam.team.act, 'act0');
assert.equal(resetTeam.team.penalties, 5);
assert.equal(resetTeam.team.strikes, 2);

// ---- reset clears the pass log ----
await request('/api/act/complete', alphaCookie, { act: 'act0' });
const afterPass = await (await request(`/api/admin/teams/${alphaRow.id}`, adminCookie)).json();
assert.equal(afterPass.team.act, 'act1');
assert.equal(afterPass.team.lastPassedAct, 'act0');
await request(`/api/admin/teams/${alphaRow.id}/reset`, adminCookie, {});
const clearedPass = await (await request(`/api/admin/teams/${alphaRow.id}`, adminCookie)).json();
assert.equal(clearedPass.team.act, 'act0');
assert.equal(clearedPass.team.lastPassedAct, null, 'a reset run keeps no last-passed act');

// A pass after the reset shows again, and reset-all wipes it for every team.
await request('/api/act/complete', alphaCookie, { act: 'act0' });
const beforeAll = await (await request('/api/admin/overview', adminCookie)).json();
assert.equal(beforeAll.teams.find((t) => t.id === alphaRow.id).lastPassedAct, 'act0');
await request('/api/admin/reset-all', adminCookie, { clearMessages: true });
const afterAll = await (await request('/api/admin/overview', adminCookie)).json();
assert(
  afterAll.teams.every((t) => t.act === 'act0' && t.lastPassedAct === null),
  'reset-all returns every team to a clean board'
);

// ---- announcements ----
await request('/api/admin/announce', adminCookie, { text: 'Ten minutes remaining.', level: 'warning' });
const ann = await (await request('/api/announcement')).json();
assert.equal(ann.announcement.text, 'Ten minutes remaining.');
assert.equal(ann.announcement.level, 'warning');
const stateWithAnn = await (await request('/api/state', alphaCookie)).json();
assert.equal(stateWithAnn.announcement.text, 'Ten minutes remaining.');
// The heartbeat carries the announcement too, so playing teams receive a
// broadcast within one ping instead of on their next game action.
const hbAnn = await (await request('/api/heartbeat', alphaCookie, undefined, 'POST')).json();
assert.equal(hbAnn.announcement.text, 'Ten minutes remaining.');
assert.equal(hbAnn.announcement.level, 'warning');
await request('/api/admin/announce', adminCookie, { text: '', level: 'info' });
const cleared = await (await request('/api/announcement')).json();
assert.equal(cleared.announcement, null);

// ---- team CRUD ----
const created = await (await request('/api/admin/teams', adminCookie, { name: 'Delta' })).json();
assert.equal(created.name, 'Delta');
assert(created.code.startsWith('ARENA-'));
const deltaCookie = await loginTeam(created.code);
const deltaState = await (await request('/api/state', deltaCookie)).json();
assert.equal(deltaState.team, 'Delta');
const dup = await request('/api/admin/teams', adminCookie, { name: 'Delta' });
assert.equal(dup.status, 409);

const deleteRes = await (await request(`/api/admin/teams/${created.id}/delete`, adminCookie, {})).json();
assert.equal(deleteRes.ok, true);
const afterDelete = await (await request('/api/admin/overview', adminCookie)).json();
assert(!afterDelete.teams.some((t) => t.id === created.id));

// ---- audit + export ----
const audit = await (await request('/api/admin/audit', adminCookie)).json();
const actions = audit.entries.map((e) => e.action);
for (const expected of ['admin_login', 'requalify', 'exempt', 'penalties', 'stage', 'rename', 'announce', 'create_team', 'delete_team']) {
  assert(actions.includes(expected), `audit records ${expected}`);
}
const csvRes = await request('/api/admin/export', adminCookie);
assert.equal(csvRes.status, 200);
const csv = await csvRes.text();
assert(csv.includes('team,status,kind'));
assert(csv.includes('Alpha Prime'));
assert(csv.includes('DISQUALIFIED') === false, 'Alpha is requalified');
assert((await request('/api/admin/export', null)).status === 401);

// Player-controlled names must not become live spreadsheet formulas.
await request(`/api/admin/teams/${alphaRow.id}/rename`, adminCookie, { name: '=SUM(A1)' });
const csvInjection = await (await request('/api/admin/export', adminCookie)).text();
assert(csvInjection.includes("'=SUM(A1)"), 'spreadsheet formulas are neutralised in the export');
await request(`/api/admin/teams/${alphaRow.id}/rename`, adminCookie, { name: 'Alpha Prime' });

// ---- input validation ----
assert.equal((await request('/api/admin/teams/99999/requalify', adminCookie, {})).status, 404);
assert.equal((await request('/api/admin/teams/99999/rename', adminCookie, { name: 'x' })).status, 404);
assert.equal((await request('/api/admin/teams/99999/delete', adminCookie, {})).status, 404);
assert.equal((await request(`/api/admin/teams/${alphaRow.id}/stage`, adminCookie, { act: 'act99' })).status, 400);
assert.equal((await request(`/api/admin/teams/${alphaRow.id}/rename`, adminCookie, { name: '   ' })).status, 400);
assert.equal((await request('/api/admin/teams', adminCookie, { name: '   ' })).status, 400);
const capped = await (await request(`/api/admin/teams/${alphaRow.id}/strikes`, adminCookie, { strikes: 999 })).json();
assert.equal(capped.strikes, 99, 'strike input is clamped');

// ---- event log: filters, pagination, summaries ----
await request(`/api/admin/teams/${alphaRow.id}/stage`, adminCookie, { act: 'act1' });
const found = await (await request('/api/clues/c_laptop_locked/discover', alphaCookie, {})).json();
assert.equal(found.clue.id, 'c_laptop_locked');

const logPage1 = await (await request('/api/admin/log?limit=5', adminCookie)).json();
assert.equal(logPage1.limit, 5);
assert(logPage1.entries.length <= 5);
assert(logPage1.total >= logPage1.entries.length);
assert(logPage1.entries.every((e) => typeof e.summary === 'string' && e.summary.length > 0));
const logPage2 = await (await request('/api/admin/log?limit=5&offset=5', adminCookie)).json();
assert(logPage2.entries.length > 0);
assert.notEqual(logPage1.entries[0].id, logPage2.entries[0].id);

const filteredLog = await (await request('/api/admin/log?type=clue_found', adminCookie)).json();
assert(filteredLog.total >= 1);
assert(filteredLog.entries.every((e) => e.type === 'clue_found'));
assert(filteredLog.entries.some((e) => e.summary.includes('Locked laptop')));

const teamLog = await (await request(`/api/admin/log?team=${alphaRow.id}`, adminCookie)).json();
assert(teamLog.entries.length > 0);
assert(teamLog.entries.every((e) => e.teamId === alphaRow.id));
const searchLog = await (await request('/api/admin/log?q=Alpha', adminCookie)).json();
assert(searchLog.entries.some((e) => (e.team ?? '').includes('Alpha')));
assert.equal((await request('/api/admin/log', null)).status, 401);

// ---- CSV exports: results, event log, admin log, team timeline ----
const resultsCsv = await (await request('/api/admin/export', adminCookie)).text();
assert(resultsCsv.startsWith('rank,team,status,kind'));
assert(resultsCsv.includes('score'));
assert(resultsCsv.includes('Alpha Prime'));

const logCsv = await (await request('/api/admin/export/log?type=clue_found', adminCookie)).text();
assert(logCsv.startsWith('id,at,team_id,team,type,summary,detail'));
assert(logCsv.includes('clue_found'));
assert(logCsv.includes('Found evidence'));

const auditCsv = await (await request('/api/admin/export/audit', adminCookie)).text();
assert(auditCsv.startsWith('id,at,actor,action,team_id,team,detail'));
assert(auditCsv.includes('admin_login'));

const timelineCsv = await (await request(`/api/admin/teams/${alphaRow.id}/export`, adminCookie)).text();
assert(timelineCsv.startsWith('id,at,type,summary,detail'));
assert(timelineCsv.includes('admin_stage'));
assert(timelineCsv.includes('clue_found'));
assert(timelineCsv.includes('login'));
assert((await request(`/api/admin/teams/${alphaRow.id}/export`, null)).status === 401);

// ---- requalify-all ----
await request(`/api/admin/teams/${alphaRow.id}/disqualify`, adminCookie, { reason: 'test batch' });
await request('/api/admin/requalify-all', adminCookie, {});
const swept = await (await request('/api/state', alphaCookie)).json();
assert.equal(swept.strikes, 0);

console.log(`PASS admin control room: auth, fullscreen strike windows, tolerances, lazy settlement, disqualification, requalification, exemptions, full team control, announcements, audit, CSV and team CRUD (${Math.round(performance.now() - start)} ms).`);
process.exit(0);
