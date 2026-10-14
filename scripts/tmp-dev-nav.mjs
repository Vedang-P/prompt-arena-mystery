// Temporary repro harness for dev-mode act/scene navigation. Removed after use.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5199';
const OUT = process.env.SHOT_OUT ?? path.join('shots', 'dev-nav');

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
    try { await fs.access(p); return p; } catch {}
  }
  throw new Error('No Edge/Chrome found');
}

await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await findBrowser(),
  headless: true,
  args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

const shot = async (name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('shot', file);
};

const readView = async () => page.evaluate(() => ({
  devToggle: document.querySelector('.dev-toggle')?.textContent?.trim() ?? null,
  kicker: document.querySelector('.location-kicker')?.textContent?.trim() ?? null,
  room: document.querySelector('.location-name')?.textContent?.trim() ?? null,
  hud: Boolean(document.querySelector('.hud-top')),
  cinema: Boolean(document.querySelector('.cinema')),
  story: Boolean(document.querySelector('.story-overlay')),
  ending: Boolean(document.querySelector('.certificate, .ending-card')),
}));

const clickText = async (selector, text) => {
  const hit = await page.evaluate((sel, t) => {
    const els = [...document.querySelectorAll(sel)];
    const el = t ? els.find((e) => e.textContent.includes(t)) : els[0];
    if (!el) return false;
    el.click();
    return true;
  }, selector, text ?? null);
  console.log(`click ${selector} "${text ?? '*'}" -> ${hit ? 'ok' : 'MISS'}`);
  return hit;
};

const clickAct = async (idx) => {
  const labels = await page.evaluate(() => [...document.querySelectorAll('.dev-act-grid button')].map((b) => b.textContent.trim()));
  console.log('act buttons:', JSON.stringify(labels));
  const label = labels[idx];
  const hit = await page.evaluate((i) => {
    const el = [...document.querySelectorAll('.dev-act-grid button')][i];
    if (!el) return false;
    el.click();
    return true;
  }, idx);
  console.log(`click act[${idx}] "${label}" -> ${hit ? 'ok' : 'MISS'}`);
};

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#enter', { timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-entered'), { timeout: 10000 }).catch(() => {});
  await page.click('#enter');
  await page.waitForSelector('#entry[open]', { timeout: 15000 });
  await page.type('#team-code', 'DEV-ARENA-9F4K-2Q7Z');
  await page.evaluate(() => document.getElementById('begin-btn').click());

  await page.waitForSelector('.cinema, .story-overlay, .hud-top', { timeout: 40000 }).catch(() => null);
  await sleep(2500);
  console.log('after login:', JSON.stringify(await readView()));

  await page.waitForSelector('.dev-toggle', { timeout: 20000 });
  await clickText('.dev-toggle');
  await sleep(500);
  await clickText('.dev-tabs button', 'Acts');
  await sleep(300);

  for (const idx of [5, 2, 1, 0]) {
    await clickAct(idx);
    await sleep(3000);
    console.log(`after act[${idx}]:`, JSON.stringify(await readView()));
    await shot(`act-${idx}`);
  }

  // From act0 (cinematic), jump to a far room.
  const panelOpen = await page.$('.dev-tabs');
  if (!panelOpen) { await clickText('.dev-toggle'); await sleep(400); }
  await clickText('.dev-tabs button', 'Rooms');
  await sleep(300);
  await clickText('.dev-row', 'Hospital');
  await sleep(3000);
  console.log('after room hospital (from act0):', JSON.stringify(await readView()));
  await shot('room-hospital');

  await sleep(500);
} finally {
  await browser.close();
}
