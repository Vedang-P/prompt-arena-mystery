// Browser regression test for the no-WebGL storyboard fallback: on a device
// with 3D graphics switched off the story must still draw — cinematics, cast
// portraits, subtitles and room interactions — and the dead "3D graphics
// switched off" panel must never appear.
//
// Expects `node scripts/dev-server.mjs` to be running at SHOT_BASE.
//
//   node scripts/test-fallback.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.SHOT_OUT ?? 'shots/fallback-check';
const TEAM_CODE = process.env.SHOT_CODE ?? 'PANDA-7K2';
const DEAD_TEXT = '3D graphics switched off';

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

// Mimics Chrome with hardware acceleration disabled: every WebGL request is
// refused, exactly what the probe must survive.
const stubWebgl = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (typeof type === 'string' && type.toLowerCase().includes('webgl')) return null;
    return original.call(this, type, ...rest);
  };
};

await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await findBrowser(),
  headless: true,
  args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { if (!/WebSocket/i.test(e.message)) console.log('[pageerror]', e.message); });

const shot = async (name) => page.screenshot({ path: path.join(OUT, `nogl-${name}.png`) });
const hasText = (needle) => page.evaluate((t) => document.body.innerText.includes(t), needle);

async function clickThroughStory() {
  // The intro overlay mounts a beat after the HUD, so keep watching for it.
  let absentChecks = 0;
  for (let i = 0; i < 240 && absentChecks < 6; i += 1) {
    if (!(await page.$('.story-overlay'))) {
      absentChecks += 1;
      await sleep(500);
      continue;
    }
    absentChecks = 0;
    await page.evaluate(() => {
      const btn = document.querySelector('.cinematic-tools .btn.brass, .story-buttons .btn.brass');
      if (btn && !btn.disabled) btn.click();
    });
    await sleep(520);
  }
}

let passed = 0;
const check = (label, value) => {
  assert.ok(value, label);
  passed += 1;
  console.log(`  ok    ${label}`);
};

try {
  await page.evaluateOnNewDocument(stubWebgl);

  // ---- cinematic stage without WebGL (dev scene review, no session) ----
  await page.goto(`${BASE}/play/index.html?review=scenes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('nav[aria-label="Development scene review"]', { timeout: 40000 });
  await sleep(3200);
  check('gazebo cinematic draws a storyboard stage', Boolean(await page.$('.fs-stage')));
  check('dead 3D-graphics panel is gone', !(await hasText(DEAD_TEXT)));
  await shot('review-gazebo');

  const picked = await page.evaluate(() => {
    const sel = document.querySelector('select[aria-label="Scene review"]');
    if (!sel) return null;
    const i = [...sel.options].findIndex((o) => o.text.includes('parth_home'));
    if (i < 0) return null;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.options[i].text;
  });
  check('interior story beat is available in the review list', Boolean(picked));
  await sleep(3200);
  check('interior beat draws a storyboard stage', Boolean(await page.$('.fs-stage')));
  await shot('review-parth-home');

  // ---- the reported scene: Act I opening beat over a live save ----
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const loginStatus = await page.evaluate(async (code) => {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    return res.status;
  }, TEAM_CODE);
  check('team sign-in succeeds', loginStatus === 200);

  await page.goto(`${BASE}/play/index.html?beat=hall_mother`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.cinema-subtitles, .phone-note', { timeout: 40000 });
  await sleep(3500);
  check('reported beat draws a storyboard stage', Boolean(await page.$('.fs-stage')));
  check('reported beat keeps its subtitles', await hasText('Parth'));
  check('dead 3D-graphics panel is gone on the beat', !(await hasText(DEAD_TEXT)));
  await shot('act1-parth-home-beat');

  // ---- interactive room without WebGL (practice save avoids fullscreen) ----
  await page.evaluate(() => fetch('/api/practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act: 'act1' }) }));
  await page.evaluate(() => localStorage.setItem('moon-mode', 'practice'));
  await page.goto(`${BASE}/play/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.story-overlay, .hud-top', { timeout: 45000 });
  await clickThroughStory();
  await page.waitForSelector('.hud-top', { timeout: 40000 });
  await sleep(2500);
  check('room view falls back to the storyboard', Boolean(await page.$('.room-fallback')));
  const dockItems = await page.$$eval('.fs-dock-item', (els) => els.length);
  check('room interactions are offered on the storyboard dock', dockItems > 0);
  await shot('room');

  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('.fs-dock-item');
    if (!btn) return false;
    btn.click();
    return true;
  });
  check('dock action can be clicked', clicked);
  const surfaced = await page
    .waitForSelector('.case-overlay, .modal-backdrop, .bubble-column, .fs-dock-item.done', { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check('dock action opens its case panel', surfaced);
  await shot('room-action');

  console.log(`\n${passed} passed, 0 failed`);
} finally {
  await browser.close();
}
