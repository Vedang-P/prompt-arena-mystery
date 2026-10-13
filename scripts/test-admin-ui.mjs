// Browser smoke test for the control room and the fullscreen gate.
// Expects `node scripts/dev-server.mjs` to be running at SHOT_BASE.
//
//   node scripts/test-admin-ui.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.SHOT_OUT ?? 'shots';
const TEAM_CODE = process.env.SHOT_CODE ?? 'PANDA-7K2';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'arena-admin';

const CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findBrowser() {
  for (const p of CANDIDATES) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  throw new Error('No Edge/Chrome found. Set EDGE_PATH to the executable.');
}

await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await findBrowser(),
  headless: true,
  args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => {
  if (!/WebSocket/i.test(e.message)) pageErrors.push(e.message);
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  if (text.includes('WebSocket') || text.includes('vite')) return;
  if (text.includes('401') || text.includes('403')) return;
  pageErrors.push(text);
});

// ---- control room ----
await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle2' });
await page.waitForSelector('.admin-login-card', { timeout: 20000 });
await page.type('input[type="password"]', ADMIN_PASSWORD);
await page.click('.admin-login-card button');
await page.waitForSelector('.admin-header', { timeout: 20000 });
await page.waitForSelector('.admin-table tbody tr', { timeout: 20000 });
const teamRows = await page.$$eval('.admin-table tbody tr', (rows) => rows.length);
assert(teamRows >= 1, 'admin board lists teams');
const chips = await page.$$eval('.admin-chip', (els) => els.map((e) => e.textContent));
assert(chips.some((c) => c.includes('Fullscreen')), 'fullscreen config chip present');
assert(chips.some((c) => c.includes('3 strikes')), 'strike config chip present');
const statCards = await page.$$eval('.admin-stat', (els) => els.map((e) => e.textContent));
assert(statCards.some((c) => c.includes('Teams')), 'stats render');

// Drawer opens and shows the timeline.
await page.click('.admin-team-link');
await page.waitForSelector('.admin-drawer', { timeout: 20000 });
await page.waitForSelector('.admin-timeline li, .admin-panel', { timeout: 20000 });
await page.screenshot({ path: path.join(OUT, 'admin-control-room.png') });
await page.click('.admin-close');
await sleep(300);

// Disqualified teams are front and centre, and requalification is one click.
const teamId = await page.evaluate(async () => {
  const res = await fetch('/api/admin/overview', { cache: 'no-store' });
  const data = await res.json();
  const team = data.teams[0];
  await fetch(`/api/admin/teams/${team.id}/disqualify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'smoke test' }),
  });
  return team.id;
});
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.admin-dq', { timeout: 20000 });
const dqText = await page.$eval('.admin-dq', (el) => el.textContent);
assert(dqText.includes('Disqualified teams'), 'DQ panel is clearly labelled');
assert(dqText.includes('Removed by invigilator — smoke test'), 'the admin reason is shown in plain words');
assert(!dqText.includes('left_fullscreen'), 'internal reason codes never leak');
await page.click('.admin-dq-actions .admin-button.primary');
await page.waitForFunction(() => !document.querySelector('.admin-dq'), { timeout: 20000 });
const requalified = await page.evaluate(async () => {
  const res = await fetch('/api/admin/overview', { cache: 'no-store' });
  return (await res.json()).stats.disqualified;
});
assert.equal(requalified, 0, 'team requalified from the panel');
void teamId;

// ---- fullscreen gate in the game ----
// Sign the browser in the same way the title card does, then land in /play/.
const loginStatus = await page.evaluate(async (code) => {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return res.status;
}, TEAM_CODE);
assert.equal(loginStatus, 200, 'team code signs in through the API');
pageErrors.length = 0;
await page.goto(`${BASE}/play/?resume=1`, { waitUntil: 'networkidle2' });
try {
  await page.waitForSelector('.fs-gate', { timeout: 60000 });
  const gateHeadline = await page.$eval('.fs-gate h2', (el) => el.textContent);
  assert.equal(gateHeadline, 'Fullscreen required', 'first entry asks for fullscreen, never a countdown');
} catch (err) {
  await page.screenshot({ path: path.join(OUT, 'play-failed.png') });
  console.error('fullscreen gate missing. body:', (await page.$eval('body', (b) => b.innerText)).slice(0, 600));
  console.error('page errors:', pageErrors);
  throw err;
}
const gateText = await page.$eval('.fs-gate', (el) => el.textContent);
assert(/Fullscreen required|Return within/.test(gateText), 'fullscreen gate blocks play');
assert(/Exit strikes/.test(gateText), 'gate shows the strike budget');
await page.screenshot({ path: path.join(OUT, 'fullscreen-gate.png') });

// Escape hatch appears after the grace period so no seat is ever stuck.
await sleep(10000);
await page.waitForSelector('.fs-gate-skip', { timeout: 15000 });
assert(pageErrors.length === 0, `no page errors: ${pageErrors.join(' | ')}`);

console.log(`PASS browser smoke: control room renders, team drawer opens, fullscreen gate blocks and offers the escape hatch (${teamRows} team row(s)).`);
await browser.close();
process.exit(0);
