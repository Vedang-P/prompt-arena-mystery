// TEMPORARY bedroom layout verification. Deleted after use.
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const BASE = 'http://127.0.0.1:5173';
const OUT = '.pa-verify-out';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await fs.mkdir(OUT, { recursive: true });

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
let exe = null;
for (const p of candidates) { try { await fs.access(p); exe = p; break; } catch {} }
if (!exe) throw new Error('no browser');
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)); });

await page.goto(BASE + '/play/?review=scenes', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('select[aria-label="Scene review"]', { timeout: 45000 });
const found = await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label="Scene review"]');
  const opt = [...sel.options].find((o) => o.textContent.includes('Environment / parth_home'));
  if (!opt) return false;
  sel.value = opt.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
});
if (!found) throw new Error('parth_home entry not found');
await page.waitForSelector('[data-scene-ready="true"]', { timeout: 60000 });
await sleep(5000);
await page.screenshot({ path: `${OUT}/parth-home-bedroom.png` });
// A second angle: orbit a little with synthetic drag for a corner read.
const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 + 60, { steps: 12 });
await page.mouse.up();
await sleep(1500);
await page.screenshot({ path: `${OUT}/parth-home-bedroom-2.png` });
await browser.close();
console.log('screens saved');
