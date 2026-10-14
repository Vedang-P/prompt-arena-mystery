import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.SHOT_OUT ?? 'shots/concert-audit';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
let executablePath = null;
for (const p of candidates) { try { await fs.access(p); executablePath = p; break; } catch {} }

await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const shot = async (n) => { await page.screenshot({ path: path.join(OUT, `${n}.png`) }); console.log('shot', n); };
const key = async (k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(250); };
const drag = async (fx, fy, tx, ty, steps = 22) => { await page.mouse.move(fx, fy); await page.mouse.down(); for (let i = 1; i <= steps; i++) { await page.mouse.move(fx + ((tx - fx) * i) / steps, fy + ((ty - fy) * i) / steps); await sleep(16); } await page.mouse.up(); await sleep(450); };
const wheel = async (dy, times) => { await page.mouse.move(800, 500); for (let i = 0; i < times; i++) { await page.mouse.wheel({ deltaY: dy }); await sleep(110); } await sleep(500); };

const loadConcert = async (hotspots = false) => {
  await page.goto(`${BASE}/play/?review=scenes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('select[aria-label="Scene review"] option', { timeout: 30000 });
  const target = await page.evaluate(() => {
    const select = document.querySelector('select[aria-label="Scene review"]');
    const index = [...select.options].findIndex((o) => o.textContent.includes('Environment / concert'));
    return select.options[index]?.value;
  });
  await page.select('select[aria-label="Scene review"]', target);
  await page.waitForSelector('[data-scene-ready="true"]', { timeout: 60000 });
  await sleep(3000);
  await page.evaluate((want) => {
    const label = [...document.querySelectorAll('nav label')].find((l) => l.textContent.includes('Hotspots'));
    const input = label?.querySelector('input');
    if (input && input.checked !== want) input.click();
  }, hotspots);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Hide review controls'))?.click());
  await sleep(300);
  await page.mouse.click(800, 700);
  await sleep(300);
};

try {
  await loadConcert(false);
  await shot('fix-01-default');

  await key('w', 2100);
  await wheel(-320, 6);
  await shot('fix-02-mic');

  await loadConcert(false);
  await drag(800, 500, 1500, 500);
  await drag(800, 500, 1500, 500);
  await shot('fix-03-behind');

  await loadConcert(true);
  await drag(800, 500, 1500, 500);
  await drag(800, 500, 900, 500);
  await shot('fix-04-auto');
} finally {
  await browser.close();
}
