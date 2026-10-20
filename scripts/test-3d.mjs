// Browser regression test: the game is 3D on every device, including one with
// hardware acceleration switched off. Runs the browser on the software
// rasteriser, makes the first WebGL requests fail for a couple of seconds
// (simulating a slow GPU process), loses the context mid-scene, and checks the
// game never downgrades to a 2D view and always recovers to a live canvas.
//
// Expects `node scripts/dev-server.mjs` to be running at SHOT_BASE.
//
//   node scripts/test-3d.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.SHOT_OUT ?? 'shots/3d-check';
// Each run signs in as a guest under a fresh name.
const GUEST_NAME = process.env.SHOT_GUEST ?? `Rig Probe ${Date.now() % 100000}`;
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

// The browser runs as if "use hardware acceleration when available" was turned
// off; it must fall back to its software rasteriser and still draw the game.
// The first 2.5 seconds of WebGL requests fail on purpose so the renderer's
// retry path is exercised instead of a one-shot probe.
const transientWebglFailure = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  const start = Date.now();
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (typeof type === 'string' && type.toLowerCase().includes('webgl') && Date.now() - start < 2500) return null;
    return original.call(this, type, ...rest);
  };
};

await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await findBrowser(),
  headless: true,
  args: ['--window-size=1600,900', '--disable-gpu', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { if (!/WebSocket/i.test(e.message)) console.log('[pageerror]', e.message); });

const shot = async (name) => page.screenshot({ path: path.join(OUT, `3d-${name}.png`) });
const hasText = (needle) => page.evaluate((t) => document.body.innerText.includes(t), needle);

let passed = 0;
const check = (label, value) => {
  assert.ok(value, label);
  passed += 1;
  console.log(`  ok    ${label}`);
};

try {
  // ---- sign in, then the reported Act I opening beat ----
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const loginStatus = await page.evaluate(async (username) => {
    const res = await fetch('/api/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username }) });
    return res.status;
  }, GUEST_NAME);
  check('guest sign-in succeeds', loginStatus === 200);

  await page.evaluateOnNewDocument(transientWebglFailure);
  await page.goto(`${BASE}/play/index.html?beat=hall_mother`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-scene-ready="true"]', { timeout: 40000 });
  await sleep(2500);
  const beatState = await page.evaluate(() => {
    const canvas = document.querySelector('.cinema-world canvas, .cinema-stage canvas');
    return { canvas: Boolean(canvas), width: canvas?.width ?? 0, dead: document.body.innerText.includes('3D graphics switched off') };
  });
  check('the 3D canvas mounts after transient context failures', beatState.canvas && beatState.width > 0);
  check('the story beat is not replaced by any 2D view', !beatState.dead);
  check('the loader has cleared — frames are drawing', !(await page.$('.scene-loader')));
  await shot('beat');

  // ---- a lost context is restored in place, never downgraded ----
  const lost = await page.evaluate(() => {
    const canvas = document.querySelector('.cinema-world canvas');
    const context = canvas?.getContext('webgl2');
    const extension = context?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  check('context loss can be simulated', lost);
  const restoring = await page.waitForSelector('.scene-loader', { timeout: 10000 }).then(() => true).catch(() => false);
  check('the restoring card appears while the context is lost', restoring);
  const recovered = await page
    .waitForFunction(() => !document.querySelector('.scene-loader'), { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check('the context is restored and the stage relights', recovered);
  check('no 2D view appeared after the loss', !(await hasText(DEAD_TEXT)));
  await shot('beat-restored');

  // ---- the interactive room stays 3D too ----
  const practiceStatus = await page.evaluate(async () => {
    const res = await fetch('/api/practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act: 'act1' }) });
    return res.status;
  });
  check('practice save starts for the room pass', practiceStatus === 200);
  await page.evaluate(() => localStorage.setItem('moon-mode', 'practice'));
  await page.goto(`${BASE}/play/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.story-overlay, .hud-top', { timeout: 45000 }).catch(() => null);
  // The act intro overlay mounts a beat after the HUD, so keep watching for it.
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
  await page.waitForSelector('.hud-top', { timeout: 40000 });
  await page.waitForSelector('.room-world canvas', { timeout: 40000 });
  await sleep(2500);
  const roomState = await page.evaluate(() => {
    const canvas = document.querySelector('.room-world canvas');
    return { canvas: Boolean(canvas), width: canvas?.width ?? 0, loader: Boolean(document.querySelector('.scene-loader')) };
  });
  check('the room canvas mounts on the software renderer', roomState.canvas && roomState.width > 0);
  check('the room finished loading frames', !roomState.loader);
  await shot('room');

  console.log(`\n${passed} passed, 0 failed`);
} finally {
  await browser.close();
}
