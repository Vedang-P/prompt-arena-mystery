// Renders the interview avatars: one head-and-shoulders still per cast rig,
// captured from the dev-only portrait studio (/play/?portraits=<id>).
//
//   npm run dev:game            (in another terminal)
//   npm run gen:portraits       (or: npm run gen:portraits -- ramu veer)
//
// Writes client/public/assets/portraits/<id>.webp. Set PORTRAIT_BASE to point at
// another dev server and BROWSER_PATH to pick a Chromium build.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.PORTRAIT_BASE ?? 'http://127.0.0.1:5173';
const OUT = path.resolve('client/public/assets/portraits');
const SIZE = 96;
const measurements = JSON.parse(await fs.readFile('client/public/assets/cast/measurements.json', 'utf8'));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(measurements);

const CANDIDATES = [
  process.env.BROWSER_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/brave',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

async function findBrowser() {
  for (const p of CANDIDATES) {
    try { await fs.access(p); return p; } catch {}
  }
  throw new Error('No Chromium-based browser found. Set BROWSER_PATH to the executable.');
}

await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await findBrowser(),
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
});
try {
  for (const id of ids) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log(`[${id}] pageerror`, e.message));
    await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/play/?portraits=${encodeURIComponent(id)}`, { waitUntil: 'networkidle0' });
    await page.addStyleTag({ content: 'html,body,#root{background:transparent!important}' });
    await page.waitForFunction(() => window.__portraitReady === true, { timeout: 60000 });
    const file = path.join(OUT, `${id}.webp`);
    await page.screenshot({ path: file, type: 'webp', quality: 88, omitBackground: true });
    console.log(`OK    ${path.relative(process.cwd(), file)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
