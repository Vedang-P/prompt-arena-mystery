// Visual harness: drives a real browser (Edge/Chrome) through the game and
// drops screenshots into ./shots so UI work can be reviewed instead of guessed.
//
//   npm run shot            (all steps)
//   npm run shot act0       (Act 0 cinematic only, still logs in first)
//   npm run shot story      (or --story: story-mode overlay, logs in first)
//   npm run shot hud        (game view + notebook, logs in first)
//
// Expects the development server (npm run dev:game) at SHOT_BASE.
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

const only = (process.argv[2] ?? '').replace(/^--/, '') || null;
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

// CinematicStory intros advance on click; the brass button on the last line
// enters the act. Click through until it appears, then press it.
const clickThroughStory = async () => {
  for (let i = 0; i < 80; i += 1) {
    if (!(await page.$('.story-overlay'))) return;
    if (await page.$('.story-buttons .btn.brass, .cinematic-tools .btn.brass')) {
      await clickSelectorText('.story-buttons .btn.brass, .cinematic-tools .btn.brass').catch(() => {});
    } else {
      await page.evaluate(() => document.querySelector('.story-overlay')?.click()).catch(() => {});
    }
    await sleep(150);
  }
  console.log('[warn] story overlay did not finish clicking through');
};

try {
  // The static title card signs teams in and hands off to /play/.
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.waitForSelector('#enter', { timeout: 30000 });
  if (wants('login')) {
    await sleep(800);
    await shot('01-title-card');
  }
  // The MIST intro card swallows the first click; wait until it has lifted.
  await page
    .waitForFunction(() => document.documentElement.classList.contains('is-entered'), { timeout: 10000 })
    .catch(() => {});

  await page.click('#enter');
  await page.waitForSelector('#entry[open]', { timeout: 15000 });
  if (wants('login')) {
    await shot('02-team-entry');
  }
  await page.type('#team-code', TEAM_CODE);
  await page.evaluate(() => document.getElementById('begin-btn').click());

  // A team that already finished Act 0 skips the cinematic — the app goes
  // straight to the current act (story overlay or game view). Either way is
  // fine: if nothing shows up we warn and keep going (full run must exit 0).
  const view = await page
    .waitForSelector('.cinema, .story-overlay, .hud-top', { timeout: 40000 })
    .catch(() => null);
  if (!view) console.log('[warn] no game view after login — continuing anyway');

  const hasCinema = Boolean(await page.$('.cinema'));

  if (wants('act0')) {
    if (hasCinema) {
      await sleep(1200);
      await shot('02-act0-card');
      await page.waitForSelector('.cinema-subtitles', { timeout: 20000 });
      await sleep(5000);
      await shot('03-act0-beat');
    } else {
      console.log('[warn] act 0 cinematic not showing (team may be past act 0) — skipping act0 shots');
    }
  }

  if ((wants('end') || wants('act0')) && hasCinema) {
    await page.waitForSelector('.cinema-subtitles', { timeout: 20000 });
    await clickSelectorText('.cinema-buttons button', 'Skip');
    await page.waitForSelector('.cinema-endcard', { timeout: 15000 });
    await sleep(900);
    await shot('04-act0-end');
    await clickSelectorText('.cinema-endcard button');
    const nextView = await page
      .waitForSelector('.story-overlay, .hud-top', { timeout: 30000 })
      .catch(() => null);
    if (nextView) {
      // The HUD renders underneath a story overlay, so wait for the overlay to
      // actually clear before calling the room view settled.
      await page.waitForSelector('.story-overlay', { timeout: 8000 }).catch(() => null);
      await clickThroughStory();
      await page
        .waitForFunction(() => !document.querySelector('.story-overlay'), { timeout: 30000 })
        .catch(() => console.log('[warn] game view did not appear after the act 1 intro'));
      await sleep(3500);
      await shot('05-act1-room');
    } else {
      console.log('[warn] no story overlay or game view after the end card — skipping 05-act1-room');
    }
  }

  // Cinematic intro/outro overlay (CinematicStory). Non-fatal: depends on where
  // in the act the session currently is.
  if (wants('story')) {
    const found = await page
      .waitForSelector('.story-mode, .story-overlay', { timeout: 10000 })
      .catch(() => null);
    await sleep(700);
    await shot(found ? '06-story-overlay' : '06-story-none');
  }

  // Game view + notebook. Non-fatal: takes whatever is on screen.
  if (wants('hud')) {
    await page.waitForSelector('.story-overlay', { timeout: 8000 }).catch(() => null);
    await clickThroughStory();
    await page
      .waitForFunction(() => !document.querySelector('.story-overlay'), { timeout: 30000 })
      .catch(() => null);
    const hud = await page
      .waitForSelector('.hud-top', { timeout: 30000 })
      .catch(() => null);
    if (hud) {
      await sleep(1200);
      await shot('06-hud-room');
      const toggle = await page.$('.notebook-toggle');
      if (toggle) {
        await toggle.click();
        await page.waitForSelector('.case-panel', { timeout: 10000 }).catch(() => null);
        await sleep(600);
        await shot('07-notebook');
        await toggle.click().catch(() => {});
        await sleep(300);
      } else {
        console.log('[warn] notebook toggle not found — skipping notebook shot');
      }
    } else {
      console.log('[warn] game view not found — skipping hud shots');
    }
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
      await page.goto(`${BASE}/play/?beat=${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.cinema-subtitles, .phone-note', { timeout: 30000 });
      await sleep(8000);
      await shot(`beat-${id}`);
    }
  }
} finally {
  await browser.close();
}
