// Visual harness: drives a real browser (Edge/Chrome) through the game and
// drops screenshots into ./shots so UI work can be reviewed instead of guessed.
//
//   npm run shot            (all steps)
//   npm run shot act0       (Act 0 cinematic only, still logs in first)
//
// Expects a dev server (vite proxy or wrangler) at SHOT_BASE.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173';
const OUT = process.env.SHOT_OUT ?? 'shots';
const TEAM_CODE = process.env.SHOT_CODE ?? 'PANDA-7K2';
const WIDTH = Number(process.env.SHOT_W ?? 1600);
const HEIGHT = Number(process.env.SHOT_H ?? 900);

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

const only = process.argv[2] ?? null;
const wants = (step) => !only || only === step;

await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await findBrowser(),
  headless: true,
  args: [
    `--window-size=${WIDTH},${HEIGHT}`,
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});

const shot = async (name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('shot', file);
};

const clickSelectorText = async (selector, text) => {
  const hit = await page.evaluate(
    (sel, t) => {
      const els = [...document.querySelectorAll(sel)];
      const el = t ? els.find((e) => e.textContent.includes(t)) : els[0];
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    text ?? null
  );
  if (!hit) throw new Error(`no ${selector} matching "${text ?? '*'}")`);
};

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (wants('login')) {
    await page.waitForSelector('.login-card', { timeout: 30000 });
    await sleep(800);
    await shot('01-login');
  }

  await page.waitForSelector('.login-card', { timeout: 30000 });
  await page.type('.login-card input', TEAM_CODE);
  await page.click('.login-card button[type=submit]');
  await page.waitForSelector('.cinema, .hud-top, .act-teaser', { timeout: 40000 });

  // A team that already finished Act 0 lands on the teaser; replay for shots.
  if (await page.$('.act-teaser')) {
    await clickSelectorText('.act-teaser button', 'Replay');
    await sleep(900);
  }

  if (wants('act0')) {
    await page.waitForSelector('.cinema', { timeout: 30000 });
    await sleep(1200);
    await shot('02-act0-card');
    await page.waitForSelector('.cinema-subtitles', { timeout: 20000 });
    await sleep(5000);
    await shot('03-act0-beat');
  }

  if (wants('end') || wants('act0')) {
    await page.waitForSelector('.cinema-subtitles', { timeout: 20000 });
    await clickSelectorText('.cinema-buttons button', 'Skip act');
    await page.waitForSelector('.cinema-endcard', { timeout: 15000 });
    await sleep(900);
    await shot('04-act0-end');
    await clickSelectorText('.cinema-endcard button', 'Enter the room');
    await page.waitForSelector('.act-teaser', { timeout: 15000 });
    await sleep(700);
    await shot('05-act1-teaser');
  }

  // Jump straight to specific beats on the local dev server (fast visual loop):
  //   SHOT_BASE=http://localhost:5173 SHOT_BEATS=station_open,room_voicenote npm run shot beats
  if (wants('beats')) {
    const ids = (
      process.env.SHOT_BEATS ?? 'gazebo_call,hall_mother,station_open,station_q2,room_voicenote,room_end'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const id of ids) {
      await page.goto(`${BASE}/?beat=${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.cinema-subtitles, .phone-note', { timeout: 30000 });
      await sleep(8000);
      await shot(`beat-${id}`);
    }
  }
} finally {
  await browser.close();
}
