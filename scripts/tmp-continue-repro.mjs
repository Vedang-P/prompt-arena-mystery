import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:5391';
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
try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const boot = await page.evaluate(async () => {
    const guest = await fetch('/api/guest', { method: 'POST' });
    const practice = await fetch('/api/practice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act: 'act2' }) });
    localStorage.setItem('moon-mode', 'practice');
    return { guest: guest.status, practice: practice.status, body: (await practice.text()).slice(0, 120) };
  });
  console.log('boot:', JSON.stringify(boot));
  await page.goto(`${BASE}/play/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.cinematic-story', { timeout: 40000 });
  await sleep(1500);
  for (let i = 0; i < 9; i += 1) {
    const before = await page.evaluate(() => ({
      counter: document.querySelector('.cinematic-tools > span')?.textContent ?? null,
      caption: (document.querySelector('.cinematic-caption p')?.textContent ?? '').slice(0, 55),
      buttons: [...document.querySelectorAll('.cinematic-tools .btn')].map((b) => b.textContent.trim()),
      captionCount: document.querySelectorAll('.cinematic-caption').length,
    }));
    console.log(`before ${i + 1}:`, JSON.stringify(before));
    const brass = await page.$('.cinematic-tools .btn.brass');
    if (brass) await brass.evaluate((el) => el.click());
    await sleep(650);
    const after = await page.evaluate(() => ({
      counter: document.querySelector('.cinematic-tools > span')?.textContent ?? null,
      overlay: Boolean(document.querySelector('.cinematic-story')),
      location: document.querySelector('.location-name')?.textContent ?? null,
    }));
    console.log(`after  ${i + 1}:`, JSON.stringify(after));
    if (!after.overlay) break;
  }
} finally {
  await browser.close();
}
