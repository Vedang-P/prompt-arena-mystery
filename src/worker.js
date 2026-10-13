// Prompt Arena: Mystery — Worker API.
// Auth, game state, clue discovery, streaming interrogation, accusations, leaderboard.

import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { caseData, getCharacter } from './case.js';
import {
  chapterCheckpoint,
  canAdvanceAct,
  canonicalAnswer,
  characterAvailable,
  checkCulprit,
  clueGate,
  conclusionMatches,
  deflection,
  discover,
  isNoise,
  isRepeat,
  judgeMessages,
  publicCase,
  publicEnding,
  puzzleGate,
  solvePuzzle,
  unlockedFactList,
} from './engine.js';
import { makeLLM } from './llm.js';
import { createSession, hashCode, readSession } from './auth.js';

const app = new Hono();

const RATE_MIN_MS = 1500;
const RATE_WINDOW_MS = 60_000;
const RATE_WINDOW_MAX = 12;

// ---------- event control (fullscreen enforcement) ----------
// A team that leaves the arena gets graceMs to come back. Only a return that
// misses the window (plus a network tolerance) counts as a strike; three
// strikes disqualify, unless the team is exempt or an admin has cleared them.
const DEFAULT_EXIT_GRACE_MS = 10_000;
const EXIT_RETURN_TOLERANCE_MS = 2_000;
const DEFAULT_MAX_EXIT_STRIKES = 3;
const ONLINE_WINDOW_MS = 45_000;
const LAST_SEEN_MIN_MS = 10_000;
const DISQUALIFY_REASON = 'left_fullscreen';
const DISQUALIFY_REASON_MANUAL = 'admin_decision';

const numEnv = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const exitGraceMs = (env) => numEnv(env.EXIT_GRACE_MS, DEFAULT_EXIT_GRACE_MS);
const maxExitStrikes = (env) => numEnv(env.EXIT_MAX_STRIKES, DEFAULT_MAX_EXIT_STRIKES);

// Fullscreen enforcement follows event rules by default: on for classroom and
// team-code play; force it on or off with FULLSCREEN_ENFORCE=true|false.
const fullscreenEnforced = (env) => {
  const raw = envString(env.FULLSCREEN_ENFORCE);
  if (raw) return isTruthy(raw);
  return isTruthy(env.EVENT_MODE) || isTruthy(env.ALLOW_CODE_LOGIN);
};

const isDisqualified = (row) => Number(row?.disqualified ?? 0) === 1;

const toIso = (value) => {
  if (!value) return null;
  const text = String(value);
  return text.includes('T') ? text : `${text.replace(' ', 'T')}Z`;
};

const parseStamp = (value) => {
  if (!value) return null;
  const text = String(value);
  const ms = Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : null;
};

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'prompt-arena-mystery',
    version: '1.1.7',
    // Short commit of the running deployment: the client compares it with its
    // baked-in build and offers a refresh when an open tab has gone stale.
    build: String(globalThis.process?.env?.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
    // Booleans only — never values. Tells an operator at a glance which knobs this
    // deployment actually has wired up.
    env: {
      sessionSecret: Boolean(c.env.SESSION_SECRET),
      codePepper: Boolean(c.env.CODE_PEPPER),
      sessionSecretIsExample: envString(c.env.SESSION_SECRET) === DEV_SESSION_SECRET,
      codePepperIsExample: envString(c.env.CODE_PEPPER) === DEV_CODE_PEPPER,
      eventMode: isTruthy(c.env.EVENT_MODE),
      codeLogin: isTruthy(c.env.ALLOW_CODE_LOGIN),
      llm: Boolean(c.env.LLM_BASE_URL && c.env.LLM_API_KEY && c.env.LLM_MODEL),
    },
  })
);

// ---------- helpers ----------

const TEAM_COLUMNS = `t.id, t.name, t.code_hash, t.created_at AS team_created_at,
  t.disqualified, t.disqualified_at, t.disqualify_reason, t.exit_strikes,
  t.pending_exit_at, t.pending_exit_kind, t.exempt, t.last_seen_at, t.admin_note`;

/**
 * Resolve a pending exit into a return (inside the grace window) or a strike
 * (late). The pending row is claimed atomically with a conditional UPDATE so
 * two concurrent requests can never double-count one exit. Never throws about
 * a missing row — the caller keeps working with the state it had.
 */
async function settlePendingExit(env, row) {
  const current = {
    strikes: Number(row.exit_strikes ?? 0),
    disqualified: isDisqualified(row),
    resolved: null,
    elapsedMs: null,
  };
  if (!row.pending_exit_at) return current;

  const startedMs = parseStamp(row.pending_exit_at);
  const elapsedMs = startedMs === null ? Infinity : Date.now() - startedMs;
  // Fairness: a slow network can delay both reports; only a return clearly
  // outside the window, plus tolerance, is a strike.
  const late = !(elapsedMs <= exitGraceMs(env) + EXIT_RETURN_TOLERANCE_MS);
  const strikes = late ? current.strikes + 1 : current.strikes;
  const crossesLimit = late && strikes >= maxExitStrikes(env) && !Number(row.exempt ?? 0);
  const nowIso = new Date().toISOString();

  const sets = ['pending_exit_at = NULL', 'pending_exit_kind = NULL', 'exit_strikes = ?'];
  const binds = [strikes];
  const disqualified = current.disqualified || crossesLimit;
  if (crossesLimit && !current.disqualified) {
    sets.push('disqualified = 1', 'disqualified_at = ?', 'disqualify_reason = ?');
    binds.push(nowIso, DISQUALIFY_REASON);
  }

  const claim = await env.DB.prepare(
    `UPDATE teams SET ${sets.join(', ')} WHERE id = ? AND pending_exit_at = ?`
  )
    .bind(...binds, row.id, row.pending_exit_at)
    .run();
  if (!(Number(claim?.meta?.changes ?? 0) > 0)) return current;

  await env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(
      row.id,
      late ? 'exit_strike' : 'exit_return',
      JSON.stringify({
        elapsedMs: elapsedMs === Infinity ? null : Math.round(elapsedMs),
        strikes,
        graceMs: exitGraceMs(env),
        kind: row.pending_exit_kind ?? null,
      })
    )
    .run();

  return { strikes, disqualified, resolved: late ? 'strike' : 'return', elapsedMs: elapsedMs === Infinity ? null : Math.round(elapsedMs) };
}

async function touchTeam(env, row) {
  const last = parseStamp(row.last_seen_at);
  if (last !== null && Date.now() - last < LAST_SEEN_MIN_MS) return;
  try {
    await env.DB.prepare('UPDATE teams SET last_seen_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), row.id)
      .run();
  } catch {
    // Presence is telemetry; a failure must never break a game request.
  }
}

async function requireTeam(c) {
  const secret = sessionSecretFor(c);
  if (!secret) return null;
  const teamId = await readSession(
    getCookie(c, c.req.header('x-game-mode') === 'practice' ? 'pa_practice' : 'pa_session'),
    secret
  );
  if (!teamId) return null;
  const row = await c.env.DB.prepare(
    `SELECT ${TEAM_COLUMNS}, p.* FROM teams t JOIN progress p ON p.team_id = t.id WHERE t.id = ?`
  )
    .bind(teamId)
    .first();
  if (!row) return null;
  if (isTruthy(c.env.EVENT_MODE) && (/^(guest:|practice:|google:)/.test(row.code_hash) || row.name === 'TEAM-042')) return null;

  const settlement = await settlePendingExit(c.env, row);
  await touchTeam(c.env, row);
  const progress = { ...row, exit_strikes: settlement.strikes, disqualified: settlement.disqualified ? 1 : 0 };
  return {
    teamId,
    teamName: row.name,
    progress,
    strikes: settlement.strikes,
    disqualified: settlement.disqualified,
    blocked: settlement.disqualified ? 'disqualified' : null,
    settlement,
  };
}

function blockedPayload(auth, env) {
  return {
    error: 'disqualified',
    team: auth.teamName,
    strikes: auth.strikes,
    maxStrikes: maxExitStrikes(env),
    graceMs: exitGraceMs(env),
    disqualifiedAt: toIso(auth.progress.disqualified_at),
    reason: auth.progress.disqualify_reason ?? DISQUALIFY_REASON,
  };
}

/**
 * Every player route goes through this: the auth object, or a ready response
 * (401 for no session, 403 with the full disqualification record for a
 * blacklisted team, so the client can explain itself instead of guessing).
 */
async function requireActiveTeam(c) {
  const auth = await requireTeam(c);
  if (!auth) return { error: c.json({ error: 'unauthorized' }, 401) };
  if (auth.blocked) return { auth, error: c.json(blockedPayload(auth, c.env), 403) };
  return { auth };
}

// Loopback and private-LAN hosts may fall back to the built-in literals (they run over plain
// http, where a Secure cookie would be dropped). A *configured* value is always honoured,
// even if it happens to be the documented example — the hole being closed is a deployment
// that never set one at all. Health reports whether an example value is still in place.
const DEV_SESSION_SECRET = 'dev-secret';
const DEV_CODE_PEPPER = 'dev-pepper';

const hostOf = (c) => new URL(c.req.url).hostname;

const isInsecureHost = (c) =>
  /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostOf(c));

const envString = (value) => (typeof value === 'string' ? value : '');

const sessionSecretFor = (c) => {
  const secret = envString(c.env.SESSION_SECRET);
  if (secret) return secret;
  return isInsecureHost(c) ? DEV_SESSION_SECRET : null;
};

const codePepperFor = (c) => {
  const pepper = envString(c.env.CODE_PEPPER);
  if (pepper) return pepper;
  return isInsecureHost(c) ? DEV_CODE_PEPPER : null;
};

const misconfigured = (c) =>
  c.json({ error: 'server_misconfigured', detail: 'This deployment is missing its session secret.' }, 500);

// JSON list columns may predate the NOT NULL defaults on a migrated database.
const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseJsonObject = (value) => {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

async function activeAnnouncement(env) {
  try {
    const row = await env.DB.prepare(
      'SELECT id, text, level, created_at FROM announcements WHERE active = 1 ORDER BY id DESC LIMIT 1'
    ).first();
    return row ? { id: row.id, text: row.text, level: row.level, at: toIso(row.created_at) } : null;
  } catch {
    return null;
  }
}

const parseJsonLoose = (value) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const parseJudge = (text) => {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return { method: !!parsed.method, motive: !!parsed.motive };
  } catch {
    return null;
  }
};

// ---------- auth ----------

const isTruthy = (value) => /^(1|true|yes|on)$/i.test(String(value ?? ''));

const googleUrls = (env) => ({
  auth: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  token: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  userinfo: env.GOOGLE_USERINFO_URL || 'https://www.googleapis.com/oauth2/v3/userinfo',
});

const googleReady = (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

async function setSessionCookie(c, teamId) {
  const secret = sessionSecretFor(c);
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  setCookie(c, 'pa_session', await createSession(teamId, secret), {
    httpOnly: true,
    secure: !isInsecureHost(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
}

const authErrorRedirect = (c, code) => {
  const url = new URL('/play/', c.req.url);
  url.searchParams.set('auth_error', code);
  return c.redirect(url.toString());
};

const sanitizeName = (value) =>
  String(value).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Player';

async function upsertGoogleTeam(env, profile) {
  const key = `google:${profile.sub}`;
  let team = await env.DB.prepare('SELECT id FROM teams WHERE code_hash = ?').bind(key).first();
  if (!team) {
    const emailLocal = String(profile.email || '').split('@')[0];
    const base = sanitizeName(profile.name || emailLocal || 'Player');
    let name = base;
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = await env.DB.prepare('SELECT id FROM teams WHERE name = ?').bind(name).first();
      if (!taken) break;
      name = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    await env.DB.prepare('INSERT OR IGNORE INTO teams(name, code_hash) VALUES (?, ?)')
      .bind(name, key)
      .run();
    team = await env.DB.prepare('SELECT id FROM teams WHERE code_hash = ?').bind(key).first();
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO progress(team_id, started_at) VALUES (?, datetime('now'))"
  )
    .bind(team.id)
    .run();
  return team.id;
}

// Which sign-in methods this deployment offers (the login screen asks first).
app.get('/api/auth/config', (c) =>
  c.json({
    google: !isTruthy(c.env.EVENT_MODE) && googleReady(c.env),
    guest: !isTruthy(c.env.EVENT_MODE),
    devLogin: isTruthy(c.env.ALLOW_CODE_LOGIN),
    eventMode: isTruthy(c.env.EVENT_MODE),
    fullscreen: fullscreenEnforced(c.env),
    graceMs: exitGraceMs(c.env),
    maxStrikes: maxExitStrikes(c.env),
  })
);

// A solo run gets its own durable save, never the shared demo team's progress.
app.post('/api/guest', async (c) => {
  if (isTruthy(c.env.EVENT_MODE)) return c.json({ error: 'assigned_code_required' }, 403);
  const id = crypto.randomUUID();
  const name = `Detective-${id.slice(0, 8)}`;
  await c.env.DB.prepare('INSERT INTO teams(name, code_hash) VALUES (?, ?)')
    .bind(name, `guest:${id}`).run();
  const team = await c.env.DB.prepare('SELECT id FROM teams WHERE code_hash = ?')
    .bind(`guest:${id}`).first();
  await c.env.DB.prepare("INSERT INTO progress(team_id, started_at) VALUES (?, datetime('now'))")
    .bind(team.id).run();
  await setSessionCookie(c, team.id);
  return c.json({ team: name });
});

app.post('/api/practice', async (c) => {
  if (isTruthy(c.env.EVENT_MODE)) return c.json({ error: 'practice_disabled_during_event' }, 403);
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  const { act } = await c.req.json().catch(() => ({}));
  if (!caseData.acts.some((a) => a.id === act)) return c.json({ error: 'unknown_act' }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO teams(name, code_hash) VALUES (?, ?)')
    .bind(`Practice-${id.slice(0, 8)}`, `practice:${id}`).run();
  const team = await c.env.DB.prepare('SELECT id FROM teams WHERE code_hash = ?').bind(`practice:${id}`).first();
  const checkpoint = chapterCheckpoint(act);
  await c.env.DB.prepare("INSERT INTO progress(team_id, started_at, act, discovered, solved_puzzles, flags) VALUES (?, datetime('now'), ?, ?, ?, ?)")
    .bind(team.id, act, JSON.stringify(checkpoint.discovered), JSON.stringify(checkpoint.solvedPuzzles), '{"practice":true}').run();
  const practiceSecret = sessionSecretFor(c);
  if (!practiceSecret) return misconfigured(c);
  setCookie(c, 'pa_practice', await createSession(team.id, practiceSecret), {
    httpOnly: true, secure: !isInsecureHost(c), sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 3600,
  });
  return c.json({ act });
});

// Google OAuth 2.0 authorization-code flow.
app.get('/api/auth/google', (c) => {
  if (isTruthy(c.env.EVENT_MODE)) return c.json({ error: 'assigned_code_required' }, 403);
  if (!googleReady(c.env)) return authErrorRedirect(c, 'google_not_configured');
  const state = crypto.randomUUID();
  setCookie(c, 'pa_oauth_state', state, {
    httpOnly: true,
    secure: !isInsecureHost(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: new URL('/api/auth/google/callback', c.req.url).toString(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return c.redirect(`${googleUrls(c.env).auth}?${params.toString()}`);
});

app.get('/api/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const expected = getCookie(c, 'pa_oauth_state');
  deleteCookie(c, 'pa_oauth_state', { path: '/' });
  if (!googleReady(c.env)) return authErrorRedirect(c, 'google_not_configured');
  if (c.req.query('error')) return authErrorRedirect(c, 'google_denied');
  if (!code || !state || !expected || state !== expected) return authErrorRedirect(c, 'state');

  const urls = googleUrls(c.env);
  const redirectUri = new URL('/api/auth/google/callback', c.req.url).toString();
  let profile;
  try {
    const tokenRes = await fetch(urls.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return authErrorRedirect(c, 'token');
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return authErrorRedirect(c, 'token');

    const infoRes = await fetch(urls.userinfo, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) return authErrorRedirect(c, 'profile');
    profile = await infoRes.json();
  } catch {
    return authErrorRedirect(c, 'network');
  }
  if (!profile?.sub) return authErrorRedirect(c, 'profile');

  const teamId = await upsertGoogleTeam(c.env, profile);
  await c.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(teamId, 'login', JSON.stringify({ provider: 'google' }))
    .run();
  await setSessionCookie(c, teamId);
  return c.redirect('/play/');
});

app.get('/api/auth/logout', (c) => {
  deleteCookie(c, 'pa_session', { path: '/' });
  deleteCookie(c, 'pa_practice', { path: '/' });
  c.header('Cache-Control', 'no-store');
  return c.redirect('/');
});

// Team-code sign-in survives for local development and offline events only.
// Disabled unless the deployment sets ALLOW_CODE_LOGIN.
app.post('/api/login', async (c) => {
  if (!isTruthy(c.env.ALLOW_CODE_LOGIN)) return c.json({ error: 'code_login_disabled' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  if (!code) return c.json({ error: 'code_required' }, 400);

  const pepper = codePepperFor(c);
  if (!pepper) return misconfigured(c);
  const hash = await hashCode(code, pepper);
  const team = await c.env.DB.prepare('SELECT id, name FROM teams WHERE code_hash = ?')
    .bind(hash)
    .first();
  if (!team) return c.json({ error: 'invalid_code' }, 401);

  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO progress(team_id, started_at) VALUES (?, datetime('now'))"
  )
    .bind(team.id)
    .run();

  await setSessionCookie(c, team.id);
  if (isTruthy(c.env.EVENT_MODE)) {
    const progress = await c.env.DB.prepare('SELECT flags FROM progress WHERE team_id = ?').bind(team.id).first();
    await c.env.DB.prepare('UPDATE progress SET flags = ? WHERE team_id = ?')
      .bind(JSON.stringify({ ...parseJsonObject(progress?.flags), eventEntered: true }), team.id).run();
  }
  await c.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(team.id, 'login', JSON.stringify({ method: 'code' })).run();
  return c.json({ team: team.name });
});

// ---------- game state ----------

// Reopen the case from Act 0. The run keeps its start time (the event clock
// never stops) and takes a fixed penalty so a restart cannot beat a clean run.
const RESTART_PENALTY = 10;

app.post('/api/restart', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  const penalties = Number(auth.progress.penalties ?? 0) + RESTART_PENALTY;
  await c.env.DB.prepare(
    "UPDATE progress SET act = 'act0', discovered = '[]', solved_puzzles = '[]', penalties = ?, hints_used = 0, accusation = NULL, ending = NULL, solved = 0, solved_at = NULL WHERE team_id = ?"
  )
    .bind(penalties, auth.teamId)
    .run();
  await c.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(auth.teamId, 'restart', JSON.stringify({ penalty: RESTART_PENALTY }))
    .run();
  return c.json({ ok: true, penalties });
});

app.get('/api/state', async (c) => {
  if (!sessionSecretFor(c)) return misconfigured(c);
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  const discovered = parseJsonArray(auth.progress.discovered);
  const solvedPuzzles = parseJsonArray(auth.progress.solved_puzzles);
  const penalties = Number(auth.progress.penalties ?? 0);
  const act = auth.progress.act ?? 'act0';
  return c.json({
    team: auth.teamName,
    practice: !!parseJsonObject(auth.progress.flags).practice,
    eventStarted: true,
    paused: false,
    llm: !!(c.env.LLM_API_KEY && c.env.LLM_BASE_URL && c.env.LLM_MODEL),
    ...publicCase({ act, discovered, solvedPuzzles }),
    act,
    discovered,
    solvedPuzzles,
    penalties,
    unlocked: unlockedFactList(discovered),
    canAdvance: canAdvanceAct(auth.progress.solved_puzzles, discovered, act),
    ending: auth.progress.ending ? publicEnding(auth.progress.ending) : null,
    score: discovered.length + solvedPuzzles.length - penalties,
    hintsUsed: auth.progress.hints_used,
    solved: !!auth.progress.solved,
    strikes: auth.strikes,
    maxStrikes: maxExitStrikes(c.env),
    graceMs: exitGraceMs(c.env),
    fullscreen: fullscreenEnforced(c.env),
    exempt: !!Number(auth.progress.exempt ?? 0),
    pendingExit: auth.progress.pending_exit_at
      ? { at: toIso(auth.progress.pending_exit_at), kind: auth.progress.pending_exit_kind ?? 'fullscreen' }
      : null,
    announcement: await activeAnnouncement(c.env),
    serverTime: new Date().toISOString(),
  });
});

// ---------- fullscreen enforcement ----------

// The client reports every time it leaves fullscreen (or the tab goes hidden),
// and every time it comes back. A return inside the grace window clears the
// pending exit; a late or missing return is a strike. The server clock is the
// authority, with a tolerance so slow networks can never cost a team its place.
app.post('/api/fullscreen/exit', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  if (!fullscreenEnforced(c.env)) return c.json({ enforced: false, strikes: auth.strikes });
  if (Number(auth.progress.exempt ?? 0)) return c.json({ enforced: true, exempt: true, strikes: auth.strikes });

  const body = await c.req.json().catch(() => ({}));
  const kind = ['fullscreen', 'hidden', 'unload', 'blur'].includes(body.kind) ? body.kind : 'fullscreen';
  const graceMs = exitGraceMs(c.env);

  const row = await c.env.DB.prepare('SELECT pending_exit_at FROM teams WHERE id = ?').bind(auth.teamId).first();
  if (!row?.pending_exit_at) {
    const nowIso = new Date().toISOString();
    await c.env.DB.prepare(
      'UPDATE teams SET pending_exit_at = ?, pending_exit_kind = ? WHERE id = ? AND pending_exit_at IS NULL'
    )
      .bind(nowIso, kind, auth.teamId)
      .run();
    await c.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
      .bind(auth.teamId, 'exit', JSON.stringify({ kind, graceMs }))
      .run();
  }

  const current = await c.env.DB.prepare('SELECT pending_exit_at, exit_strikes FROM teams WHERE id = ?')
    .bind(auth.teamId)
    .first();
  const started = parseStamp(current?.pending_exit_at) ?? Date.now();
  return c.json({
    enforced: true,
    graceMs,
    deadline: new Date(started + graceMs).toISOString(),
    strikes: Number(current?.exit_strikes ?? auth.strikes),
    maxStrikes: maxExitStrikes(c.env),
  });
});

// Coming back: requireActiveTeam already settled the pending exit and applied
// any strike, so this endpoint only reports the verdict to the client.
app.post('/api/fullscreen/return', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  const settlement = auth.settlement ?? { resolved: null, elapsedMs: null };
  return c.json({
    ok: settlement.resolved !== 'strike',
    late: settlement.resolved === 'strike',
    applied: settlement.resolved !== null,
    elapsedMs: settlement.elapsedMs,
    strikes: auth.strikes,
    maxStrikes: maxExitStrikes(c.env),
    graceMs: exitGraceMs(c.env),
    disqualified: auth.disqualified,
  });
});

// A browser that cannot do fullscreen (some phones, embedded browsers) reports
// once so the admin can see why that seat is never asked to return.
app.post('/api/fullscreen/unsupported', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  await c.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(auth.teamId, 'fullscreen_unsupported', JSON.stringify({ userAgent: c.req.header('user-agent')?.slice(0, 180) ?? null }))
    .run();
  return c.json({ ok: true });
});

// Presence ping while a team is in play: keeps the admin board's online state
// honest and gives a pending exit a chance to be settled even if the player
// never clicks back into the game.
app.post('/api/heartbeat', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  await c.env.DB.prepare('UPDATE teams SET last_seen_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), auth.teamId)
    .run();
  return c.json({ ok: true, strikes: auth.strikes });
});

// What every player sees right now, if the invigilator has posted something.
app.get('/api/announcement', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({ announcement: await activeAnnouncement(c.env) });
});

// Advance the act timeline. Act 0 is a cinematic: the client reports completion.
app.post('/api/act/complete', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  const body = await c.req.json().catch(() => ({}));
  const actId = String(body.act || '');
  const acts = caseData.acts ?? [];
  const act = acts.find((a) => a.id === actId);
  if (!act) return c.json({ error: 'unknown_act' }, 404);

  const current = auth.progress.act ?? 'act0';
  const currentIndex = acts.findIndex((a) => a.id === current);
  const actIndex = acts.findIndex((a) => a.id === actId);
  if (actIndex > currentIndex) return c.json({ error: 'act_locked', current }, 409);

  // Interactive acts unlock only once their complete.clues/complete.puzzles are done.
  if (act.type === 'interactive') {
    const discovered = parseJsonArray(auth.progress.discovered);
    const gate = canAdvanceAct(auth.progress.solved_puzzles, discovered, actId);
    if (!gate.ok) {
      return c.json({ error: 'act_locked', missing: gate.missing ?? { clues: [], puzzles: [] } }, 409);
    }
  }

  const next = acts[Math.min(actIndex + 1, acts.length - 1)] ?? act;
  const stored = actIndex >= currentIndex ? next.id : current;
  await c.env.DB.prepare("UPDATE progress SET act = ?, started_at = CASE WHEN act = 'act0' AND ? != 'act0' THEN datetime('now') ELSE started_at END WHERE team_id = ?")
    .bind(stored, stored, auth.teamId)
    .run();

  // Completing the final act ends the run; solved_at is only set the first time.
  let ending = null;
  if (actIndex === acts.length - 1 && actIndex >= currentIndex) {
    ending = 'ending_main';
    await c.env.DB.prepare('UPDATE progress SET ending = ? WHERE team_id = ?')
      .bind(ending, auth.teamId)
      .run();
    await c.env.DB.prepare(
      "UPDATE progress SET solved = 1, solved_at = datetime('now') WHERE team_id = ? AND solved = 0"
    )
      .bind(auth.teamId)
      .run();
  }

  await c.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(auth.teamId, 'act_complete', JSON.stringify({ act: actId, next: stored, ending }))
    .run();
  return c.json({ act: stored, ending: ending ? publicEnding(ending) : null });
});

app.post('/api/clues/:id/discover', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  const clueId = c.req.param('id');
  const discovered = parseJsonArray(auth.progress.discovered);
  const gate = clueGate(auth.progress.act ?? 'act0', auth.progress.solved_puzzles, discovered, clueId);
  if (!gate.ok && gate.error === 'locked') {
    return c.json({ error: 'locked', missing: gate.missing }, 409);
  }
  const result = discover(discovered, clueId);
  if (!result.ok) {
    return c.json({ error: result.error }, result.error === 'locked' ? 409 : 404);
  }
  if (!result.alreadyFound) {
    await c.env.DB.prepare('UPDATE progress SET discovered = ? WHERE team_id = ?')
      .bind(JSON.stringify(result.discovered), auth.teamId)
      .run();
    await c.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
      .bind(auth.teamId, 'clue_found', JSON.stringify({ clue: clueId, name: result.clue?.name ?? clueId }))
      .run();
  }
  return c.json({
    clue: result.clue,
    discovered: result.discovered,
    newlyUnlocked: result.newlyUnlocked,
  });
});

// Solve a puzzle: the engine normalizes the answer, applies penalties, and grants clues.
app.post('/api/puzzles/:id/solve', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  const puzzleId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const answer = String(body.answer ?? '');
  const discovered = parseJsonArray(auth.progress.discovered);
  const solvedPuzzles = parseJsonArray(auth.progress.solved_puzzles);

  // A puzzle is only solvable from the act that offers it, once its requires are met.
  const gate = puzzleGate(auth.progress.act ?? 'act0', auth.progress.solved_puzzles, discovered, puzzleId);
  if (!gate.ok) {
    if (gate.error === 'unknown_puzzle') return c.json({ error: 'unknown_puzzle' }, 404);
    return c.json({ error: 'not_ready', missing: gate.missing ?? null }, 403);
  }

  const result = solvePuzzle(auth.progress.solved_puzzles, discovered, puzzleId, answer);
  if (!result.ok) {
    if (result.error === 'unknown_puzzle') return c.json({ error: 'unknown_puzzle' }, 404);
    if (result.error === 'bad_answer') return c.json({ error: 'bad_answer' }, 400);
    if (result.error === 'locked' || result.error === 'not_ready') {
      return c.json({ error: 'not_ready', missing: result.missing ?? null }, 403);
    }
    return c.json({ error: result.error || 'bad_request' }, 400);
  }

  const penalty = Number(result.penalty ?? 0);
  const totalPenalties = Number(auth.progress.penalties ?? 0) + penalty;
  const nextSolved = Array.isArray(result.solvedPuzzles) ? result.solvedPuzzles : solvedPuzzles;
  const nextDiscovered = Array.isArray(result.discovered) ? result.discovered : discovered;

  if (JSON.stringify(nextSolved) !== JSON.stringify(solvedPuzzles)) {
    await c.env.DB.prepare('UPDATE progress SET solved_puzzles = ? WHERE team_id = ?')
      .bind(JSON.stringify(nextSolved), auth.teamId)
      .run();
  }
  if (JSON.stringify(nextDiscovered) !== JSON.stringify(discovered)) {
    await c.env.DB.prepare('UPDATE progress SET discovered = ? WHERE team_id = ?')
      .bind(JSON.stringify(nextDiscovered), auth.teamId)
      .run();
  }
  if (penalty > 0) {
    await c.env.DB.prepare('UPDATE progress SET penalties = ? WHERE team_id = ?')
      .bind(totalPenalties, auth.teamId)
      .run();
  }

  const ending = result.ending ?? null;
  if (ending) {
    await c.env.DB.prepare('UPDATE progress SET ending = ? WHERE team_id = ?')
      .bind(ending, auth.teamId)
      .run();
    await c.env.DB.prepare(
      "UPDATE progress SET solved = 1, solved_at = datetime('now') WHERE team_id = ? AND solved = 0"
    )
      .bind(auth.teamId)
      .run();
  }

  await c.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(
      auth.teamId,
      'puzzle_solve',
      JSON.stringify({
        puzzle: puzzleId,
        correct: !!result.correct,
        alreadySolved: !!result.alreadySolved,
        penalty,
        ending,
      })
    )
    .run();

  return c.json({
    correct: !!result.correct,
    alreadySolved: !!result.alreadySolved,
    penalty,
    totalPenalties,
    message: result.message ?? '',
    grants: result.grants ?? [],
    newlyUnlocked: result.newlyUnlocked ?? [],
    solvedPuzzles: nextSolved,
    discovered: nextDiscovered,
    ending,
  });
});

app.get('/api/characters/:id/history', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  const characterId = c.req.param('id');
  if (!getCharacter(characterId)) return c.json({ error: 'unknown_character' }, 404);
  if (!characterAvailable(characterId, auth.progress.act ?? 'act0')) return c.json({ error: 'not_available' }, 403);
  const rows = await c.env.DB.prepare(
    'SELECT role, content, source FROM messages WHERE team_id = ? AND character = ? ORDER BY id ASC LIMIT 100'
  )
    .bind(auth.teamId, characterId)
    .all();
  return c.json({ messages: rows.results });
});

// ---------- interrogation (SSE) ----------

app.post('/api/interrogate', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;

  const body = await c.req.json().catch(() => ({}));
  const characterId = String(body.character || '');
  const text = String(body.text || '').trim().slice(0, 600);
  const reqId = String(body.reqId || '').slice(0, 64) || null;
  if (!getCharacter(characterId) || !text) return c.json({ error: 'bad_request' }, 400);
  if (!characterAvailable(characterId, auth.progress.act ?? 'act0')) {
    return c.json({ error: 'not_available' }, 403);
  }

  // Replaying a request must not spend a second model call or a second rate-limit slot.
  // The unique index allows one row per (team, req_id), so the player row is the anchor and
  // the reply is the next npc row after it; a retry of a turn that died mid-stream reuses
  // the stored question instead of inserting it again.
  let playerStored = false;
  if (reqId) {
    const prior = await c.env.DB.prepare(
      'SELECT id FROM messages WHERE team_id = ? AND character = ? AND req_id = ? ORDER BY id LIMIT 1'
    )
      .bind(auth.teamId, characterId, reqId)
      .first();
    if (prior) {
      const reply = await c.env.DB.prepare(
        "SELECT content, source FROM messages WHERE team_id = ? AND character = ? AND role = 'npc' AND id > ? ORDER BY id LIMIT 1"
      )
        .bind(auth.teamId, characterId, prior.id)
        .first();
      if (reply) {
        return streamSSE(c, async (stream) => {
          await stream.writeSSE({ event: 'meta', data: JSON.stringify({ character: characterId, replayed: true }) });
          await stream.writeSSE({ event: 'reset', data: JSON.stringify({ text: reply.content }) });
          await stream.writeSSE({ event: 'done', data: JSON.stringify({ source: reply.source, replayed: true }) });
        });
      }
      playerStored = true;
    }
  }

  const now = Date.now();
  const p = auth.progress;
  if (now - p.last_prompt_ms < RATE_MIN_MS) return c.json({ error: 'slow_down' }, 429);
  const windowStart = now - p.window_start > RATE_WINDOW_MS ? now : p.window_start;
  const windowCount = windowStart === now ? 1 : p.window_count + 1;
  if (windowCount > RATE_WINDOW_MAX) return c.json({ error: 'slow_down' }, 429);
  await c.env.DB.prepare(
    'UPDATE progress SET last_prompt_ms = ?, window_start = ?, window_count = ? WHERE team_id = ?'
  )
    .bind(now, windowStart, windowCount, auth.teamId)
    .run();

  const previousPlayer = await c.env.DB.prepare(
    "SELECT content FROM messages WHERE team_id = ? AND character = ? AND role = 'player' ORDER BY id DESC LIMIT 1"
  )
    .bind(auth.teamId, characterId)
    .first();
  const repeat = isRepeat(text, previousPlayer?.content ?? '');
  const noise = isNoise(text);
  const priorFallbacks = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE team_id = ? AND character = ? AND role = 'npc' AND source IN ('deflect','snub')"
  )
    .bind(auth.teamId, characterId)
    .first();

  if (!playerStored) {
    await c.env.DB.prepare(
      'INSERT INTO messages(team_id, character, role, content, source, req_id) VALUES (?,?,?,?,?,?)'
    )
      .bind(auth.teamId, characterId, 'player', text, 'player', reqId)
      .run();
  }

  // The interrogation is deterministic: the authored keywords plus the 70%
  // similarity gate decide whether a lead is revealed. Any other question
  // cycles the character's deflection lines instead of leaking information.
  const canned = !repeat && !noise ? canonicalAnswer(characterId, text) : null;
  const source = canned ? 'canonical' : repeat ? 'snub' : 'deflect';
  const final = canned ?? deflection(characterId, (priorFallbacks?.n ?? 0) + 1, repeat);

  return streamSSE(c, async (stream) => {
    let clientGone = false;

    // A dropped client must not lose the stored turn, so write failures are
    // swallowed and the transcript still records the exchange.
    const send = async (event, data) => {
      if (clientGone) return;
      try {
        await stream.writeSSE({ event, data: JSON.stringify(data) });
      } catch {
        clientGone = true;
      }
    };

    await send('meta', { character: characterId });
    await send('reset', { text: final });

    await c.env.DB.prepare(
      'INSERT INTO messages(team_id, character, role, content, source) VALUES (?,?,?,?,?)'
    )
      .bind(auth.teamId, characterId, 'npc', final, source)
      .run();

    await send('done', { source });
  });
});

// ---------- accusation ----------

app.post('/api/accuse', async (c) => {
  const { auth, error } = await requireActiveTeam(c);
  if (error) return error;
  if (isTruthy(c.env.EVENT_MODE)) return c.json({ error: 'Complete the final act to submit the case conclusion.' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const culprit = String(body.culprit || '');
  const method = String(body.method || '').trim().slice(0, 800);
  const motive = String(body.motive || '').trim().slice(0, 800);

  if (!checkCulprit(culprit)) {
    return c.json({ correct: false, stage: 'culprit' });
  }

  const discovered = parseJsonArray(auth.progress.discovered);
  const required = caseData.solution.required_clues ?? [];
  const missing = required.filter((id) => !discovered.includes(id));
  if (missing.length) {
    return c.json({ correct: false, stage: 'evidence', missing });
  }

  let checks = null;
  let judge = 'fallback';
  const llm = makeLLM(c.env, () => {});
  if (llm) {
    try {
      const out = await llm.complete(judgeMessages(method, motive), { temperature: 0, maxTokens: 200 });
      const parsed = parseJudge(out);
      if (parsed) {
        checks = parsed;
        judge = 'llm';
      }
    } catch {
      // fall through to the deterministic judge
    }
  }
  if (!checks) {
    checks = {
      method: conclusionMatches(method, caseData.solution.method),
      motive: conclusionMatches(motive, caseData.solution.motive),
    };
  }

  const correct = checks.method && checks.motive;
  await c.env.DB.prepare('UPDATE progress SET accusation = ? WHERE team_id = ?')
    .bind(JSON.stringify({ culprit, method, motive, checks, judge }), auth.teamId)
    .run();

  if (correct) {
    await c.env.DB.prepare(
      "UPDATE progress SET solved = 1, solved_at = datetime('now') WHERE team_id = ? AND solved = 0"
    )
      .bind(auth.teamId)
      .run();
  }

  return c.json({ correct, stage: correct ? 'solved' : 'conclusion', checks, judge });
});

// ---------- leaderboard ----------

app.get('/api/leaderboard', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT t.name, t.code_hash, p.act, p.started_at, p.solved, p.solved_at,
            json_array_length(COALESCE(p.discovered, '[]')) AS clues_found,
            json_array_length(COALESCE(p.solved_puzzles, '[]')) AS puzzles_solved,
            p.hints_used, COALESCE(p.penalties, 0) AS penalties
     FROM progress p JOIN teams t ON t.id = p.team_id
     WHERE COALESCE(p.flags, '{}') NOT LIKE '%"practice":true%'
     AND t.name != 'Instructor preview'
     AND COALESCE(t.disqualified, 0) = 0
     ${isTruthy(c.env.EVENT_MODE) ? `AND COALESCE(p.flags, '{}') LIKE '%"eventEntered":true%'` : ''}
     ORDER BY p.solved_at IS NULL, p.solved_at ASC,
              (json_array_length(COALESCE(p.solved_puzzles, '[]')) +
               json_array_length(COALESCE(p.discovered, '[]'))) DESC,
              COALESCE(p.penalties, 0) ASC, p.hints_used ASC`
  ).all();
  const now = Date.now();
  const timestamp = value => value ? Date.parse(value.includes('T') ? value : value.replace(' ','T')+'Z') : null;
  const teams = rows.results.filter(row => !isTruthy(c.env.EVENT_MODE) || (!/^(guest:|practice:|google:)/.test(row.code_hash) && row.name !== 'TEAM-042'))
    .map(({ code_hash, ...row }) => ({ ...row, actTitle: `${caseData.acts.find(a=>a.id===row.act)?.kicker ?? row.act} · ${caseData.acts.find(a=>a.id===row.act)?.title ?? ''}`,
      elapsedSeconds: row.act === 'act0' || !row.started_at ? 0 : Math.max(0, Math.floor(((timestamp(row.solved_at) ?? now) - timestamp(row.started_at)) / 1000)) }));
  teams.sort((a,b) => Number(b.solved)-Number(a.solved) || Number(b.act?.replace('act',''))-Number(a.act?.replace('act','')) || a.elapsedSeconds-b.elapsedSeconds || a.name.localeCompare(b.name));
  c.header('Cache-Control', 'public, max-age=0, s-maxage=5');
  return c.json({ teams, serverTime: new Date(now).toISOString() });
});

// ---------- admin control room ----------

const ADMIN_SESSION_HOURS = 12;
const ADMIN_ATTEMPT_WINDOW_MS = 5 * 60_000;
const ADMIN_ATTEMPT_MAX = 10;
const DEV_ADMIN_PASSWORD = 'arena-admin';
const adminAttempts = new Map();

const adminUsername = (env) => envString(env.ADMIN_USERNAME) || 'admin';

// Same contract as the session secret: a configured value always wins; the
// development literal only exists on loopback/private hosts, and a public
// deployment without ADMIN_PASSWORD keeps the control room locked.
const adminPasswordFor = (c) => {
  const configured = envString(c.env.ADMIN_PASSWORD);
  if (configured) return configured;
  return isInsecureHost(c) ? DEV_ADMIN_PASSWORD : null;
};

async function requireAdmin(c) {
  const secret = sessionSecretFor(c);
  if (!secret) return false;
  const token = getCookie(c, 'pa_admin');
  if (!token) return false;
  return (await readSession(token, secret)) === 'admin';
}

const adminUnauthorized = (c) => c.json({ error: 'admin_unauthorized' }, 401);

const adminAttemptKey = (c) =>
  String(c.req.header('x-forwarded-for') || '').split(',')[0].trim() || hostOf(c);

function adminThrottled(c) {
  const key = adminAttemptKey(c);
  const now = Date.now();
  for (const [k, v] of adminAttempts) if (now - v.start > ADMIN_ATTEMPT_WINDOW_MS) adminAttempts.delete(k);
  const entry = adminAttempts.get(key);
  return Boolean(entry && entry.count >= ADMIN_ATTEMPT_MAX);
}

function noteAdminFailure(c) {
  const key = adminAttemptKey(c);
  const entry = adminAttempts.get(key);
  if (entry && Date.now() - entry.start <= ADMIN_ATTEMPT_WINDOW_MS) entry.count += 1;
  else adminAttempts.set(key, { start: Date.now(), count: 1 });
}

// Compare without leaking length or prefix timing.
const timingSafeEqualText = (a, b) => {
  const x = String(a ?? '');
  const y = String(b ?? '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
};

async function audit(env, action, teamId = null, detail = null) {
  try {
    await env.DB.prepare('INSERT INTO admin_audit(actor, action, team_id, detail) VALUES (?,?,?,?)')
      .bind(adminUsername(env), action, teamId, detail ? JSON.stringify(detail) : null)
      .run();
  } catch {
    // Audit is best-effort; it must never block the action it describes.
  }
}

async function adminContext(c) {
  if (!(await requireAdmin(c))) return { error: adminUnauthorized(c) };
  const body = c.req.method === 'POST' ? await c.req.json().catch(() => ({})) : {};
  return { body, env: c.env };
}

const TEAM_DETAIL_COLUMNS = `${TEAM_COLUMNS},
  p.act, p.flags, p.penalties, p.discovered, p.solved_puzzles, p.hints_used,
  p.solved, p.solved_at, p.started_at, p.accusation, p.ending`;

const adminTeamRow = (env, id) =>
  env.DB.prepare(`SELECT ${TEAM_DETAIL_COLUMNS} FROM teams t LEFT JOIN progress p ON p.team_id = t.id WHERE t.id = ?`)
    .bind(id)
    .first();

/**
 * One public shape for the admin board and the team drawer: current stage,
 * the last stage passed and when, penalties, exits, presence — nothing the
 * control room has to reverse-engineer client-side.
 */
function shapeTeamRow(row, env, options = {}) {
  const acts = caseData.acts ?? [];
  const history = options.history ?? [];
  const now = options.now ?? Date.now();
  const actId = row.act ?? 'act0';
  const actRow = acts.find((a) => a.id === actId) ?? acts[0] ?? null;
  const lastPass = history.length ? history[history.length - 1] : null;
  const lastPassRow = lastPass ? acts.find((a) => a.id === lastPass.act) ?? null : null;
  const entered = [...history].reverse().find((ev) => ev.next === actId) ?? null;
  const lastSeenMs = parseStamp(row.last_seen_at);
  const startedMs = parseStamp(row.started_at);
  const solvedMs = parseStamp(row.solved_at);
  const codeHash = String(row.code_hash || '');
  const kind = /^guest:/.test(codeHash) ? 'guest' : /^practice:/.test(codeHash) ? 'practice' : /^google:/.test(codeHash) ? 'google' : 'team';
  const titleOf = (act) => (act ? `${act.kicker ?? act.id} · ${act.title ?? ''}` : null);
  const disqualified = isDisqualified(row);

  return {
    id: row.id,
    name: row.name,
    kind,
    practice: !!parseJsonObject(row.flags).practice,
    eventEntered: !!parseJsonObject(row.flags).eventEntered,
    act: actId,
    actNumber: Math.max(0, acts.findIndex((a) => a.id === actId)),
    actTitle: titleOf(actRow),
    actType: actRow?.type ?? null,
    actEnteredAt: toIso(entered?.at ?? (actId !== 'act0' ? row.started_at : null)),
    lastPassedAct: lastPass?.act ?? null,
    lastPassedTitle: titleOf(lastPassRow) ?? lastPass?.act ?? null,
    lastPassedAt: toIso(lastPass?.at ?? null),
    discovered: parseJsonArray(row.discovered).length,
    solvedPuzzles: parseJsonArray(row.solved_puzzles).length,
    totalClues: (caseData.clues ?? []).length,
    totalPuzzles: (caseData.puzzles ?? []).length,
    penalties: Number(row.penalties ?? 0),
    hintsUsed: Number(row.hints_used ?? 0),
    solved: !!row.solved,
    solvedAt: toIso(row.solved_at),
    startedAt: toIso(row.started_at),
    elapsedSeconds: actId === 'act0' || startedMs === null ? 0 : Math.max(0, Math.floor(((solvedMs ?? now) - startedMs) / 1000)),
    strikes: Number(row.exit_strikes ?? 0),
    maxStrikes: maxExitStrikes(env),
    disqualified,
    disqualifiedAt: toIso(row.disqualified_at),
    disqualifyReason: row.disqualify_reason ?? null,
    exempt: !!Number(row.exempt ?? 0),
    pendingExit: row.pending_exit_at
      ? {
          at: toIso(row.pending_exit_at),
          kind: row.pending_exit_kind ?? 'fullscreen',
          expiresAt: new Date((parseStamp(row.pending_exit_at) ?? now) + exitGraceMs(env) + EXIT_RETURN_TOLERANCE_MS).toISOString(),
        }
      : null,
    online: lastSeenMs !== null && now - lastSeenMs <= ONLINE_WINDOW_MS && !row.pending_exit_at && !disqualified,
    lastSeenAt: toIso(row.last_seen_at),
    adminNote: row.admin_note ?? null,
    ending: row.ending ?? null,
    accusation: parseJsonLoose(row.accusation),
    createdAt: toIso(row.team_created_at),
  };
}

async function adminOverview(env) {
  const rows = (await env.DB.prepare(`SELECT ${TEAM_DETAIL_COLUMNS} FROM teams t LEFT JOIN progress p ON p.team_id = t.id ORDER BY t.id ASC`).all()).results;

  // Pending exits that timed out become strikes even if the team never came
  // back, so the board always shows the enforcement's own verdict.
  for (const row of rows) {
    if (!row.pending_exit_at) continue;
    const settled = await settlePendingExit(env, row);
    if (settled.resolved !== null) {
      row.exit_strikes = settled.strikes;
      row.pending_exit_at = null;
      row.pending_exit_kind = null;
      if (settled.disqualified) {
        row.disqualified = 1;
        row.disqualified_at = row.disqualified_at ?? new Date().toISOString();
        row.disqualify_reason = row.disqualify_reason ?? DISQUALIFY_REASON;
      }
    }
  }

  const actEvents = (await env.DB.prepare("SELECT team_id, detail, created_at FROM events WHERE type = 'act_complete' ORDER BY id ASC").all()).results;
  const historyByTeam = new Map();
  for (const ev of actEvents) {
    const detail = parseJsonLoose(ev.detail) ?? {};
    const list = historyByTeam.get(ev.team_id) ?? [];
    list.push({ act: detail.act ?? null, next: detail.next ?? null, at: ev.created_at, ending: detail.ending ?? null });
    historyByTeam.set(ev.team_id, list);
  }

  const now = Date.now();
  const shaped = rows.map((row) => shapeTeamRow(row, env, { history: historyByTeam.get(row.id) ?? [], now }));

  const recentEvents = (await env.DB.prepare(
    `SELECT e.id, e.team_id, t.name AS team_name, e.type, e.detail, e.created_at
     FROM events e LEFT JOIN teams t ON t.id = e.team_id
     ORDER BY e.id DESC LIMIT 40`
  ).all()).results.map((e) => ({
    id: e.id,
    teamId: e.team_id,
    team: e.team_name ?? null,
    type: e.type,
    detail: parseJsonLoose(e.detail),
    at: toIso(e.created_at),
  }));

  const opponent = shaped.filter((t) => t.kind === 'team');
  const stats = {
    total: shaped.length,
    teams: opponent.length,
    guestsPractice: shaped.length - opponent.length,
    online: opponent.filter((t) => t.online).length,
    inPlay: opponent.filter((t) => t.actNumber > 0 && !t.solved && !t.disqualified).length,
    notStarted: opponent.filter((t) => t.actNumber === 0 && !t.solved && !t.disqualified).length,
    solved: opponent.filter((t) => t.solved).length,
    disqualified: shaped.filter((t) => t.disqualified).length,
    warned: shaped.filter((t) => t.strikes > 0 && !t.disqualified).length,
    exempt: shaped.filter((t) => t.exempt).length,
    pendingExits: shaped.filter((t) => t.pendingExit).length,
  };

  const distribution = (caseData.acts ?? []).map((a) => ({
    id: a.id,
    title: `${a.kicker ?? a.id} · ${a.title ?? ''}`,
    count: opponent.filter((t) => t.act === a.id && !t.disqualified).length,
  }));

  return {
    teams: shaped,
    stats,
    distribution,
    recentEvents,
    config: {
      eventMode: isTruthy(env.EVENT_MODE),
      codeLogin: isTruthy(env.ALLOW_CODE_LOGIN),
      fullscreen: fullscreenEnforced(env),
      graceMs: exitGraceMs(env),
      maxStrikes: maxExitStrikes(env),
      llm: !!(env.LLM_API_KEY && env.LLM_BASE_URL && env.LLM_MODEL),
      admin: adminUsername(env),
    },
    serverTime: new Date(now).toISOString(),
  };
}

app.post('/api/admin/login', async (c) => {
  if (adminThrottled(c)) return c.json({ error: 'too_many_attempts' }, 429);
  const password = adminPasswordFor(c);
  if (!password) {
    return c.json({ error: 'admin_not_configured', detail: 'Set ADMIN_PASSWORD on this deployment to open the control room.' }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const okUser = timingSafeEqualText(String(body.username ?? '').trim(), adminUsername(c.env));
  const okPass = timingSafeEqualText(String(body.password ?? ''), password);
  if (!okUser || !okPass) {
    noteAdminFailure(c);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return c.json({ error: 'bad_credentials' }, 401);
  }
  adminAttempts.delete(adminAttemptKey(c));
  const secret = sessionSecretFor(c);
  if (!secret) return misconfigured(c);
  setCookie(c, 'pa_admin', await createSession('admin', secret, ADMIN_SESSION_HOURS), {
    httpOnly: true,
    secure: !isInsecureHost(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: ADMIN_SESSION_HOURS * 3600,
  });
  await audit(c.env, 'admin_login');
  return c.json({ ok: true, username: adminUsername(c.env) });
});

app.post('/api/admin/logout', async (c) => {
  deleteCookie(c, 'pa_admin', { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/admin/session', async (c) => {
  if (!(await requireAdmin(c))) return c.json({ authed: false }, 401);
  return c.json({
    authed: true,
    username: adminUsername(c.env),
    eventMode: isTruthy(c.env.EVENT_MODE),
    codeLogin: isTruthy(c.env.ALLOW_CODE_LOGIN),
    fullscreen: fullscreenEnforced(c.env),
    graceMs: exitGraceMs(c.env),
    maxStrikes: maxExitStrikes(c.env),
    llm: !!(c.env.LLM_API_KEY && c.env.LLM_BASE_URL && c.env.LLM_MODEL),
  });
});

app.get('/api/admin/overview', async (c) => {
  if (!(await requireAdmin(c))) return adminUnauthorized(c);
  c.header('Cache-Control', 'no-store');
  return c.json(await adminOverview(c.env));
});

app.get('/api/admin/teams/:id', async (c) => {
  if (!(await requireAdmin(c))) return adminUnauthorized(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const row = await adminTeamRow(c.env, id);
  if (!row) return c.json({ error: 'unknown_team' }, 404);

  const events = (await c.env.DB.prepare(
    'SELECT id, type, detail, created_at FROM events WHERE team_id = ? ORDER BY id DESC LIMIT 400'
  ).bind(id).all()).results.map((e) => ({
    id: e.id,
    type: e.type,
    detail: parseJsonLoose(e.detail),
    at: toIso(e.created_at),
  }));

  const chatCounts = (await c.env.DB.prepare(
    'SELECT character, COUNT(*) AS n FROM messages WHERE team_id = ? GROUP BY character'
  ).bind(id).all()).results;

  c.header('Cache-Control', 'no-store');
  return c.json({
    team: shapeTeamRow(row, c.env, { history: [] }),
    events,
    chatCounts: chatCounts.map((r) => ({ character: r.character, messages: Number(r.n ?? 0) })),
    maxStrikes: maxExitStrikes(c.env),
    graceMs: exitGraceMs(c.env),
  });
});

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

app.get('/api/admin/export', async (c) => {
  if (!(await requireAdmin(c))) return adminUnauthorized(c);
  const data = await adminOverview(c.env);
  const header = [
    'team', 'status', 'kind', 'current_act', 'current_act_title', 'act_entered_at',
    'last_passed_act', 'last_passed_title', 'last_passed_at', 'clues', 'puzzles',
    'penalties', 'hints', 'exit_strikes', 'max_exit_strikes', 'disqualified',
    'disqualified_at', 'disqualify_reason', 'exempt', 'solved', 'solved_at',
    'elapsed_seconds', 'online', 'last_seen_at', 'admin_note',
  ];
  const rows = data.teams.map((t) => [
    t.name,
    t.disqualified ? 'DISQUALIFIED' : t.solved ? 'solved' : t.act === 'act0' ? 'not started' : 'playing',
    t.kind, t.act, t.actTitle, t.actEnteredAt, t.lastPassedAct, t.lastPassedTitle, t.lastPassedAt,
    t.discovered, t.solvedPuzzles, t.penalties, t.hintsUsed, t.strikes, t.maxStrikes,
    t.disqualified ? 'yes' : 'no', t.disqualifiedAt, t.disqualifyReason, t.exempt ? 'yes' : 'no',
    t.solved ? 'yes' : 'no', t.solvedAt, t.elapsedSeconds, t.online ? 'yes' : 'no', t.lastSeenAt, t.adminNote,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="prompt-arena-teams.csv"');
  return c.body(csv);
});

app.get('/api/admin/audit', async (c) => {
  if (!(await requireAdmin(c))) return adminUnauthorized(c);
  const rows = (await c.env.DB.prepare(
    `SELECT a.id, a.actor, a.action, a.team_id, t.name AS team_name, a.detail, a.created_at
     FROM admin_audit a LEFT JOIN teams t ON t.id = a.team_id
     ORDER BY a.id DESC LIMIT 200`
  ).all()).results;
  c.header('Cache-Control', 'no-store');
  return c.json({
    entries: rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      teamId: r.team_id,
      team: r.team_name ?? null,
      detail: parseJsonLoose(r.detail),
      at: toIso(r.created_at),
    })),
  });
});

// Create a team with an assigned code (generated when omitted). The plaintext
// code is returned once to the admin; only its hash is stored.
app.post('/api/admin/teams', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const rawName = String(ctx.body.name ?? '').trim();
  if (!rawName) return c.json({ error: 'name_required' }, 400);
  const name = sanitizeName(rawName);
  const code = String(ctx.body.code ?? '').trim().toUpperCase() || `ARENA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const pepper = codePepperFor(c);
  if (!pepper) return misconfigured(c);
  const hash = await hashCode(code, pepper);
  const taken = await ctx.env.DB.prepare('SELECT id FROM teams WHERE name = ? OR code_hash = ?').bind(name, hash).first();
  if (taken) return c.json({ error: 'team_exists' }, 409);
  await ctx.env.DB.prepare('INSERT INTO teams(name, code_hash) VALUES (?, ?)').bind(name, hash).run();
  const team = await ctx.env.DB.prepare('SELECT id FROM teams WHERE code_hash = ?').bind(hash).first();
  await ctx.env.DB.prepare('INSERT OR IGNORE INTO progress(team_id, started_at) VALUES (?, datetime(\'now\'))').bind(team.id).run();
  await audit(ctx.env, 'create_team', team.id, { name });
  return c.json({ ok: true, id: team.id, name, code });
});

// Clear a blacklist and, by default, reset the strikes that caused it. This is
// the "whitelist a team manually" path: the team resumes exactly where it was.
app.post('/api/admin/teams/:id/requalify', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const row = await ctx.env.DB.prepare('SELECT id, name, exit_strikes FROM teams WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  const resetStrikes = ctx.body.resetStrikes !== false;
  const strikes = resetStrikes ? 0 : Number(row.exit_strikes ?? 0);
  await ctx.env.DB.prepare(
    'UPDATE teams SET disqualified = 0, disqualified_at = NULL, disqualify_reason = NULL, exit_strikes = ?, pending_exit_at = NULL, pending_exit_kind = NULL WHERE id = ?'
  ).bind(strikes, id).run();
  await ctx.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(id, 'requalified', JSON.stringify({ resetStrikes, strikes })).run();
  await audit(ctx.env, 'requalify', id, { resetStrikes });
  return c.json({ ok: true, strikes });
});

app.post('/api/admin/teams/:id/disqualify', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const row = await ctx.env.DB.prepare('SELECT id, name FROM teams WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  const reason = String(ctx.body.reason ?? '').trim().slice(0, 200) || DISQUALIFY_REASON_MANUAL;
  const nowIso = new Date().toISOString();
  await ctx.env.DB.prepare('UPDATE teams SET disqualified = 1, disqualified_at = ?, disqualify_reason = ? WHERE id = ?')
    .bind(nowIso, reason, id).run();
  await ctx.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(id, 'disqualified', JSON.stringify({ reason, manual: true })).run();
  await audit(ctx.env, 'disqualify', id, { reason });
  return c.json({ ok: true });
});

app.post('/api/admin/teams/:id/strikes', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const row = await ctx.env.DB.prepare('SELECT id, exit_strikes FROM teams WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  const strikes = Math.max(0, Math.min(99, Math.trunc(Number(ctx.body.strikes ?? 0) || 0)));
  await ctx.env.DB.prepare('UPDATE teams SET exit_strikes = ? WHERE id = ?').bind(strikes, id).run();
  await ctx.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(id, 'admin_strikes', JSON.stringify({ from: Number(row.exit_strikes ?? 0), to: strikes })).run();
  await audit(ctx.env, 'set_strikes', id, { strikes });
  return c.json({ ok: true, strikes });
});

app.post('/api/admin/teams/:id/exempt', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const row = await ctx.env.DB.prepare('SELECT id, exempt FROM teams WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  const exempt = ctx.body.exempt === true || Number(ctx.body.exempt) === 1;
  await ctx.env.DB.prepare(
    `UPDATE teams SET exempt = ?${exempt ? ', pending_exit_at = NULL, pending_exit_kind = NULL' : ''} WHERE id = ?`
  ).bind(exempt ? 1 : 0, id).run();
  await ctx.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(id, exempt ? 'exempted' : 'unexempted', null).run();
  await audit(ctx.env, exempt ? 'exempt' : 'unexempt', id);
  return c.json({ ok: true, exempt });
});

app.post('/api/admin/teams/:id/penalties', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const row = await ctx.env.DB.prepare('SELECT t.id, COALESCE(p.penalties, 0) AS penalties FROM teams t LEFT JOIN progress p ON p.team_id = t.id WHERE t.id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  const delta = Math.trunc(Number(ctx.body.delta ?? 0) || 0);
  const penalties = Math.max(0, Math.min(9999, Number(row.penalties ?? 0) + delta));
  await ctx.env.DB.prepare('UPDATE progress SET penalties = ? WHERE team_id = ?').bind(penalties, id).run();
  await ctx.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(id, 'admin_penalties', JSON.stringify({ delta, penalties })).run();
  await audit(ctx.env, 'penalties', id, { delta, penalties });
  return c.json({ ok: true, penalties });
});

app.post('/api/admin/teams/:id/stage', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const act = String(ctx.body.act ?? '');
  if (!(caseData.acts ?? []).some((a) => a.id === act)) return c.json({ error: 'unknown_act' }, 400);
  const row = await ctx.env.DB.prepare('SELECT id FROM teams WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  await ctx.env.DB.prepare(
    "UPDATE progress SET act = ?, started_at = CASE WHEN started_at IS NULL AND ? != 'act0' THEN datetime('now') ELSE started_at END WHERE team_id = ?"
  ).bind(act, act, id).run();
  await ctx.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(id, 'admin_stage', JSON.stringify({ act })).run();
  await audit(ctx.env, 'stage', id, { act });
  return c.json({ ok: true, act });
});

app.post('/api/admin/teams/:id/rename', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const rawName = String(ctx.body.name ?? '').trim();
  if (!rawName) return c.json({ error: 'name_required' }, 400);
  const name = sanitizeName(rawName);
  const row = await ctx.env.DB.prepare('SELECT id, name FROM teams WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  const taken = await ctx.env.DB.prepare('SELECT id FROM teams WHERE name = ? AND id != ?').bind(name, id).first();
  if (taken) return c.json({ error: 'name_taken' }, 409);
  await ctx.env.DB.prepare('UPDATE teams SET name = ? WHERE id = ?').bind(name, id).run();
  await audit(ctx.env, 'rename', id, { from: row.name, to: name });
  return c.json({ ok: true, name });
});

app.post('/api/admin/teams/:id/note', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const row = await ctx.env.DB.prepare('SELECT id FROM teams WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  const note = String(ctx.body.text ?? '').trim().slice(0, 500) || null;
  await ctx.env.DB.prepare('UPDATE teams SET admin_note = ? WHERE id = ?').bind(note, id).run();
  await audit(ctx.env, 'note', id);
  return c.json({ ok: true, note });
});

app.post('/api/admin/teams/:id/reset', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const row = await ctx.env.DB.prepare('SELECT t.id, COALESCE(p.penalties, 0) AS penalties FROM teams t LEFT JOIN progress p ON p.team_id = t.id WHERE t.id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  const addPenalty = Math.max(0, Math.trunc(Number(ctx.body.penalty ?? 0) || 0));
  const penalties = Number(row.penalties ?? 0) + addPenalty;
  await ctx.env.DB.prepare(
    "UPDATE progress SET act = 'act0', discovered = '[]', solved_puzzles = '[]', penalties = ?, hints_used = 0, accusation = NULL, ending = NULL, solved = 0, solved_at = NULL WHERE team_id = ?"
  ).bind(penalties, id).run();
  await ctx.env.DB.prepare('INSERT INTO events(team_id, type, detail) VALUES (?,?,?)')
    .bind(id, 'admin_reset', JSON.stringify({ penalty: addPenalty })).run();
  await audit(ctx.env, 'reset', id, { penalty: addPenalty });
  return c.json({ ok: true, penalties });
});

app.post('/api/admin/teams/:id/delete', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'unknown_team' }, 404);
  const row = await ctx.env.DB.prepare('SELECT id, name FROM teams WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'unknown_team' }, 404);
  await ctx.env.DB.prepare('DELETE FROM messages WHERE team_id = ?').bind(id).run();
  await ctx.env.DB.prepare('DELETE FROM events WHERE team_id = ?').bind(id).run();
  await ctx.env.DB.prepare('DELETE FROM progress WHERE team_id = ?').bind(id).run();
  await ctx.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(id).run();
  await audit(ctx.env, 'delete_team', id, { name: row.name });
  return c.json({ ok: true });
});

// Emergency release valve: clear every blacklist and strike in one move.
app.post('/api/admin/requalify-all', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const rows = (await ctx.env.DB.prepare('SELECT id FROM teams WHERE disqualified = 1 OR exit_strikes > 0 OR pending_exit_at IS NOT NULL').all()).results;
  await ctx.env.DB.prepare(
    'UPDATE teams SET disqualified = 0, disqualified_at = NULL, disqualify_reason = NULL, exit_strikes = 0, pending_exit_at = NULL, pending_exit_kind = NULL'
  ).run();
  await audit(ctx.env, 'requalify_all', null, { teams: rows.length });
  return c.json({ ok: true, teams: rows.length });
});

app.post('/api/admin/announce', async (c) => {
  const ctx = await adminContext(c);
  if (ctx.error) return ctx.error;
  const text = String(ctx.body.text ?? '').trim().slice(0, 300);
  const level = ['info', 'warning', 'urgent'].includes(ctx.body.level) ? ctx.body.level : 'info';
  await ctx.env.DB.prepare('UPDATE announcements SET active = 0 WHERE active = 1').run();
  let announcement = null;
  if (text) {
    await ctx.env.DB.prepare('INSERT INTO announcements(text, level, active) VALUES (?,?,1)').bind(text, level).run();
    announcement = await activeAnnouncement(ctx.env);
  }
  await audit(ctx.env, text ? 'announce' : 'announce_clear', null, text ? { text, level } : null);
  return c.json({ ok: true, announcement });
});

export default app;
