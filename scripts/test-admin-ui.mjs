// Browser smoke test for the control room and the game shell.
// Expects `node scripts/dev-server.mjs` to be running at SHOT_BASE.
//
//   node scripts/test-admin-ui.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.SHOT_OUT ?? 'shots';
const GUEST_NAME = process.env.SHOT_GUEST ?? `UI Probe ${Date.now() % 100000}`;
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
await page.screenshot({ path: path.join(OUT, 'admin-login.png') });
await page.type('input[type="password"]', ADMIN_PASSWORD);
await page.click('.admin-login-card button');
await page.waitForSelector('.admin-header', { timeout: 20000 });
await page.waitForSelector('.admin-table tbody tr', { timeout: 20000 });
const teamRows = await page.$$eval('.admin-table tbody tr', (rows) => rows.length);
assert(teamRows >= 1, 'admin board lists teams');
const headerChips = await page.$$eval('.admin-header .admin-chip', (els) => els.length);
assert.equal(headerChips, 0, 'the header stays free of status-chip clutter');
const statCards = await page.$$eval('.admin-stat', (els) => els.map((e) => e.textContent));
assert(statCards.some((c) => c.includes('Teams')), 'stats render');

// Row actions stay on screen even when the table scrolls horizontally.
const actionVisibility = () =>
  page.evaluate(() => {
    const cell = document.querySelector('.admin-table tbody tr .actions-cell');
    const btn = cell?.querySelector('.admin-button');
    if (!cell || !btn) return null;
    const rect = btn.getBoundingClientRect();
    return { visible: rect.width > 0 && rect.right <= window.innerWidth + 1 && rect.left >= 0 };
  });
assert((await actionVisibility())?.visible, 'Manage and Disqualify stay reachable at any scroll position');

// The same holds on a smaller, scaled-down window (the original bug report).
await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
await sleep(400);
assert((await actionVisibility())?.visible, 'actions stay reachable on a narrow window');
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
await sleep(400);

// The insights rail toggles without disturbing the table.
const insightsBtn = 'button[title="Act distribution and live activity"]';
assert(await page.$(insightsBtn), 'insights toggle exists');
await page.click(insightsBtn);
await page.waitForFunction(() => !document.querySelector('.admin-side'), { timeout: 10000 });
await page.click(insightsBtn);
await page.waitForSelector('.admin-side', { timeout: 10000 });

// Drawer opens and shows the timeline.
await page.click('.admin-team-link');
await page.waitForSelector('.admin-drawer', { timeout: 20000 });
await page.waitForSelector('.admin-timeline li, .admin-panel', { timeout: 20000 });
await page.screenshot({ path: path.join(OUT, 'admin-team-drawer.png') });
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.admin-drawer'), { timeout: 10000 });

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
assert(/disqualified team/i.test(dqText), 'DQ panel is clearly labelled');
assert(dqText.includes('Removed by invigilator — smoke test'), 'the admin reason is shown in plain words');
assert(!dqText.includes('admin_decision'), 'internal reason codes never leak');
await page.screenshot({ path: path.join(OUT, 'admin-dq-panel.png') });
await page.click('.admin-dq-actions .admin-button.primary');
await page.waitForFunction(() => !document.querySelector('.admin-dq'), { timeout: 20000 });
const requalified = await page.evaluate(async () => {
  const res = await fetch('/api/admin/overview', { cache: 'no-store' });
  return (await res.json()).stats.disqualified;
});
assert.equal(requalified, 0, 'team requalified from the panel');
void teamId;

// Broadcast from the composer reaches the board and every player screen.
await page.type('.admin-announce-controls input', 'Two minutes until the final act.');
await page.click('.admin-announce-controls .admin-button.primary');
await page.waitForSelector('.admin-announce-current', { timeout: 15000 });
const annText = await page.$eval('.admin-announce-current', (el) => el.textContent);
assert(annText.includes('Two minutes until the final act.'), 'the board mirrors the live announcement');
await page.screenshot({ path: path.join(OUT, 'admin-control-room.png') });

// Leaderboard tab mirrors the player-facing ranking.
await page.click('.admin-tabs button:nth-child(2)');
await page.waitForSelector('.admin-board-table tbody tr', { timeout: 20000 });
const rankOne = await page.$eval('.admin-board-table .board-rank', (el) => el.textContent.trim());
assert.equal(rankOne, '1', 'the leaderboard ranks teams');
assert(await page.$('.admin-board-note'), 'the board explains its ranking rule');
await page.screenshot({ path: path.join(OUT, 'admin-leaderboard.png') });

// Event log tab: readable entries, filters and a CSV export of what is shown.
await page.click('.admin-tabs button:nth-child(3)');
await page.waitForSelector('.admin-log-table tbody tr', { timeout: 20000 });
const logRows = await page.$$eval('.admin-log-table tbody tr', (rows) => rows.length);
assert(logRows >= 1, 'event log lists entries');
const logSummary = await page.$eval('.admin-log-table tbody tr td:last-child', (el) => el.textContent.trim());
assert(logSummary.length > 0, 'log entries carry a readable summary');
assert(await page.$('a[href^="/api/admin/export/log"]'), 'event log CSV export link present');
await page.select('.admin-audit select', 'requalified');
await page.waitForFunction(
  () => document.querySelectorAll('.admin-log-table tbody tr').length >= 1 && document.querySelector('.admin-log-foot span')?.textContent.includes('events'),
  { timeout: 20000 }
);
await page.screenshot({ path: path.join(OUT, 'admin-event-log.png') });
await page.click('.admin-tabs button:nth-child(1)');
await page.waitForSelector('.admin-table tbody tr', { timeout: 20000 });

// ---- the game loads in the browser ----
// Sign the browser in the same way the entry card does, then land in /play/.
const loginStatus = await page.evaluate(async (username) => {
  const res = await fetch('/api/guest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  return res.status;
}, GUEST_NAME);
assert.equal(loginStatus, 200, 'guest sign-in works through the API');
pageErrors.length = 0;
await page.goto(`${BASE}/play/?resume=1`, { waitUntil: 'networkidle2' });

// The broadcast is on the player's screen too (state load or heartbeat),
// in whatever phase the team lands in.
await page.waitForSelector('.announce-bar', { timeout: 20000 });
const banner = await page.$eval('.announce-bar', (el) => el.textContent);
assert(banner.includes('Two minutes until the final act.'), 'players see the broadcast');
await page.screenshot({ path: path.join(OUT, 'play-landing.png') });
assert(pageErrors.length === 0, `no page errors: ${pageErrors.join(' | ')}`);

// Leave the smoke database clean.
await page.evaluate(async () => {
  await fetch('/api/admin/announce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '', level: 'info' }),
  });
});

console.log(`PASS browser smoke: control room renders, team drawer opens, DQ/requalify works, the game loads with the broadcast live (${teamRows} team row(s)).`);
await browser.close();
process.exit(0);
