import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5391';
const OUT = process.env.SHOT_OUT ?? 'C:/Users/vedang/AppData/Local/Temp/opencode';
const MATCHES = (process.env.SHOT_MATCHES ?? 'act2 / intro 2 / cyber_cafe,act2 / intro 4 / cyber_cafe,act2 / intro 5 / cyber_cafe').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
let executablePath = null;
for (const p of candidates) { try { await fs.access(p); executablePath = p; break; } catch {} }
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--window-size=1600,900', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
try {
  await page.goto(`${BASE}/play/?review=scenes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('select[aria-label="Scene review"] option', { timeout: 30000 });
  const labels = await page.evaluate(() => [...document.querySelector('select[aria-label="Scene review"]').options].map((o) => ({ label: o.textContent, value: o.value })));
  for (const [i, match] of MATCHES.entries()) {
    const entry = labels.find((o) => o.label.includes(match));
    if (!entry) { console.log('no entry for', match); continue; }
    await page.select('select[aria-label="Scene review"]', entry.value);
    // The review loader clears itself once the stage reports ready; wait it out
    // (or its own 15s expiry) instead of force-dismissing the canvas.
    const started = Date.now();
    while (Date.now() - started < 30000) {
      const loader = await page.$('.scene-loader');
      if (!loader) break;
      await sleep(700);
    }
    await sleep(900);
    const out = `${OUT}/act2-ngo-${i + 1}.png`;
    await page.screenshot({ path: out });
    console.log('shot saved', out, '|', entry.label);
  }
} finally {
  await browser.close();
}
