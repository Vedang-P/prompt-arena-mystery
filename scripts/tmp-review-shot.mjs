import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const OUT = process.env.SHOT_OUT ?? 'C:/Users/vedang/AppData/Local/Temp/opencode';
const ROOM = process.env.ROOM ?? 'ngo_hq';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
let executablePath = null;
for (const p of candidates) {
  try { await fs.access(p); executablePath = p; break; } catch {}
}
if (!executablePath) throw new Error('no browser');

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });

try {
  await page.goto('http://127.0.0.1:5173/play/?review=scenes', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('select[aria-label="Scene review"] option', { timeout: 30000 });
  const target = await page.evaluate((room) => {
    const select = document.querySelector('select[aria-label="Scene review"]');
    const index = [...select.options].findIndex((o) => o.textContent.includes(`Environment / ${room}`));
    return { index, value: select.options[index]?.value };
  }, ROOM);
  console.log('entry', JSON.stringify(target));
  await page.select('select[aria-label="Scene review"]', target.value);
  await page.click('label input[type="checkbox"]'); // hotspots on
  await page.waitForSelector('[data-scene-ready="true"]', { timeout: 60000 }).catch(() => console.log('[warn] not ready in 60s'));
  await sleep(6000);
  const state = await page.evaluate(() => ({
    loader: Boolean(document.querySelector('.scene-loader')),
    loaderText: document.querySelector('.scene-loader')?.innerText ?? null,
    ready: document.querySelector('[data-scene-ready]')?.dataset.sceneReady ?? null,
  }));
  console.log('state', JSON.stringify(state));
  const hide = await page.$('nav[aria-label="Development scene review"] button:last-child');
  await hide?.click().catch(() => {});
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/review-${ROOM}.png` });
  console.log('shot', `${OUT}/review-${ROOM}.png`);
} finally {
  await browser.close();
}
