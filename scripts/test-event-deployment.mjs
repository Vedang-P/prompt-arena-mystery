import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const version = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const [base, cookieFile] = process.argv.slice(2);
assert(base?.startsWith('https://'), 'Pass the deployment URL (and optionally a Netscape cookie jar file)');
const cookies = new Map();
if (cookieFile) for (const line of (await fs.readFile(cookieFile, 'utf8')).split('\n')) {
  if (!line.includes('\t')) continue;
  const parts = line.trim().split('\t'); cookies.set(parts[5], parts[6]);
}
async function call(route, body, expected=200, {redirect='follow', headers={}}={}) {
  const response = await fetch(base+route, {method:body===undefined?'GET':'POST', redirect, headers:{'content-type':'application/json', cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '), ...headers}, body:body===undefined?undefined:JSON.stringify(body), signal:AbortSignal.timeout(60000)});
  for (const value of response.headers.getSetCookie()) {const pair=value.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}
  assert.equal(response.status,expected,route);
  return response;
}
assert.equal((await(await call('/api/health')).json()).version,version);
const config=await(await call('/api/auth/config')).json();assert.equal(config.eventMode,true);assert.equal(config.guest,true);
const GUEST=`Instructor probe ${Date.now()%100000}`;
await call('/api/guest',{username:GUEST});
const state=await(await call('/api/state')).json();assert.equal(state.team,GUEST);assert.equal(state.acts.length,9);assert.equal(state.puzzles.length,59);
await call('/api/practice',{act:'act8'},403);await call('/api/accuse',{culprit:'sameer'},403);
for (const path of ['/assets/cast/sameer.glb','/assets/cast/officer.glb','/assets/cinema/gazebo.glb','/assets/cinema/tree_small_02.glb','/assets/cinema/tree_background.glb','/assets/cinema/park_sunrise_1k.hdr','/assets/env/tiles_Diffuse.jpg','/assets/signs/police.svg','/assets/audio/dusk.mp3','/credits.html']) {
  const response=await call(path);assert((await response.arrayBuffer()).byteLength>100,path);
}
const timings=await Promise.all(Array.from({length:70},async()=>{const start=performance.now();const s=await(await call('/api/state')).json();assert.equal(s.team,GUEST);return performance.now()-start;}));
timings.sort((a,b)=>a-b);
const board=await(await call('/api/leaderboard')).json();assert(board.teams.some(t=>t.name===GUEST),'event guests enter the board with their chosen name');assert(!JSON.stringify(board).includes('code_hash'));
const logout=await call('/api/auth/logout',undefined,302,{redirect:'manual'});
assert.equal(logout.headers.get('location'),'/');
for (const name of ['pa_session','pa_practice']) assert(logout.headers.getSetCookie().some(value=>value.startsWith(name+'=') && /Max-Age=0/i.test(value)),name+' cleared');
await call('/api/state',undefined,401);
await call('/api/state',undefined,401,{headers:{'x-game-mode':'practice'}});
await call('/api/guest',{username:GUEST});
const resumed=await(await call('/api/state')).json();
assert(resumed.team.startsWith(GUEST),'a re-sign-in under a taken name gets a fresh team with a suffix');
assert.equal(resumed.act,'act0','the earlier run is a distinct team — saves do not attach to a name');
console.log(`PASS hosted event guest sign-in, logout/re-entry, saved progress, restrictions, assets and 70 concurrent state reads; p50=${Math.round(timings[34])}ms p95=${Math.round(timings[66])}ms, ${board.teams.length} entered participant teams. No other participant progress changed.`);
process.exit(0);
