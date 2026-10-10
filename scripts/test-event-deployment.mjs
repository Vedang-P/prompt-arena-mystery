import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const [base, codeFile, cookieFile] = process.argv.slice(2);
assert(base?.startsWith('https://') && codeFile, 'Pass deployment URL and private instructor code file');
const cookies = new Map();
if (cookieFile) for (const line of (await fs.readFile(cookieFile, 'utf8')).split('\n')) {
  if (!line.includes('\t')) continue;
  const parts = line.trim().split('\t'); cookies.set(parts[5], parts[6]);
}
async function call(route, body, expected=200) {
  const response = await fetch(base+route, {method:body===undefined?'GET':'POST', headers:{'content-type':'application/json', cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}, body:body===undefined?undefined:JSON.stringify(body), signal:AbortSignal.timeout(60000)});
  for (const value of response.headers.getSetCookie()) {const pair=value.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}
  assert.equal(response.status,expected,route);
  return response;
}
assert.equal((await(await call('/api/health')).json()).version,'1.1.2');
const config=await(await call('/api/auth/config')).json();assert.equal(config.eventMode,true);assert.equal(config.guest,false);
await call('/api/login',{code:(await fs.readFile(codeFile,'utf8')).trim()});
const state=await(await call('/api/state')).json();assert.equal(state.team,'Instructor preview');assert.equal(state.acts.length,9);assert.equal(state.puzzles.length,46);
await call('/api/guest',{},403);await call('/api/practice',{act:'act8'},403);await call('/api/accuse',{culprit:'sameer'},403);
const manifest=await(await call('/assets/audio/prologue/manifest.json')).json();assert(Object.keys(manifest).length>=40);
for (const path of ['/assets/cast/sameer.glb','/assets/cast/officer.glb','/assets/cinema/gazebo.glb','/assets/cinema/tree_small_02.glb','/assets/cinema/tree_background.glb','/assets/cinema/park_sunrise_1k.hdr','/assets/env/tiles_Diffuse.jpg','/assets/signs/police.svg',Object.values(manifest)[0].url,'/assets/audio/dusk.mp3','/credits.html']) {
  const response=await call(path);assert((await response.arrayBuffer()).byteLength>100,path);
}
const timings=await Promise.all(Array.from({length:70},async()=>{const start=performance.now();const s=await(await call('/api/state')).json();assert.equal(s.team,state.team);return performance.now()-start;}));
timings.sort((a,b)=>a-b);
const board=await(await call('/api/leaderboard')).json();assert(!board.teams.some(t=>t.name==='Instructor preview'));assert(!JSON.stringify(board).includes('code_hash'));
console.log(`PASS hosted event login, restrictions, assets and 70 concurrent state reads; p50=${Math.round(timings[34])}ms p95=${Math.round(timings[66])}ms, ${board.teams.length} entered participant teams. No participant progress changed.`);
