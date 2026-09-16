// Visual harness: drives a real browser (Edge/Chrome) through the game and
// drops screenshots into ./shots so UI work can be reviewed instead of guessed.
//
//   npm run shot            (all steps)
//   npm run shot dialogue   (only dialogue steps, still logs in first)
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
  await page.waitForSelector('.hud-top', { timeout: 30000 });

  if (wants('hall')) {
    await sleep(9000);
    await shot('02-hall');
  }

  if (wants('notebook')) {
    await page.waitForSelector('.notebook-toggle', { timeout: 15000 });
    await clickSelectorText('.notebook-toggle');
    await page.waitForSelector('.notebook-panel', { timeout: 10000 });
    await sleep(600);
    await shot('03-notebook');
    await clickSelectorText('.notebook-close', 'Close');
    await sleep(600);
  }

  if (wants('accusation')) {
    await clickSelectorText('.case-bar .btn');
    await page.waitForSelector('.modal-backdrop', { timeout: 10000 });
    await sleep(600);
    await shot('04-accusation');
    await page.mouse.click(90, Math.round(HEIGHT / 2));
    await sleep(600);
  }

  if (wants('dialogue')) {
    await sleep(3000);
    await clickSelectorText('button.hotspot', 'Odette');
    await page.waitForSelector('.ask-bar', { timeout: 20000 });
    await sleep(3200);
    await shot('05-dialogue');
    await page.type('.ask-bar input', 'Where is the violin?');
    await page.keyboard.press('Enter');
    await sleep(16000);
    await shot('06-dialogue-answer');
  }

  // Optional: clue toast + room switch for completeness.
  if (wants('clue')) {
    await clickSelectorText('.leave-btn', 'Leave');
    await sleep(2500);
    await clickSelectorText('.tab', 'Vestibule');
    await sleep(2000);
    await clickSelectorText('button.hotspot', 'Stage door');
    await sleep(1600);
    await shot('07-clue-toast');
  }
} finally {
  await browser.close();
}
