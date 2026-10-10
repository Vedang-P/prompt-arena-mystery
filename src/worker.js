// Prompt Arena: Mystery — Worker API.
// Auth, game state, clue discovery, streaming interrogation, accusations, leaderboard.

import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { caseData, getCharacter } from './case.js';
import {
  buildMessages,
  authoredAnswer,
  chapterCheckpoint,
  canAdvanceAct,
  canonicalAnswer,
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

app.get('/api/health', (c) => c.json({ ok: true, service: 'prompt-arena-mystery', version: '1.1.1' }));

// ---------- helpers ----------

async function requireTeam(c) {
  const teamId = await readSession(
    getCookie(c, c.req.header('x-game-mode') === 'practice' ? 'pa_practice' : 'pa_session'),
    c.env.SESSION_SECRET || 'dev-secret'
  );
  if (!teamId) return null;
  const row = await c.env.DB.prepare(
    'SELECT t.name AS team_name, t.code_hash, p.* FROM teams t JOIN progress p ON p.team_id = t.id WHERE t.id = ?'
  )
    .bind(teamId)
    .first();
  if (!row) return null;
  if (isTruthy(c.env.EVENT_MODE) && (/^(guest:|practice:|google:)/.test(row.code_hash) || row.team_name === 'TEAM-042')) return null;
  return { teamId, teamName: row.team_name, progress: row };
}

const isLocalHost = (c) => /^(127\.0\.0\.1|localhost)$/.test(new URL(c.req.url).hostname);

// JSON list columns may predate the NOT NULL defaults on a migrated database.
const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
  setCookie(c, 'pa_session', await createSession(teamId, c.env.SESSION_SECRET || 'dev-secret'), {
    httpOnly: true,
    secure: !isLocalHost(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
}

const authErrorRedirect = (c, code) => {
  const url = new URL('/', c.req.url);
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
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const { act } = await c.req.json().catch(() => ({}));
  if (!caseData.acts.some((a) => a.id === act)) return c.json({ error: 'unknown_act' }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO teams(name, code_hash) VALUES (?, ?)')
    .bind(`Practice-${id.slice(0, 8)}`, `practice:${id}`).run();
  const team = await c.env.DB.prepare('SELECT id FROM teams WHERE code_hash = ?').bind(`practice:${id}`).first();
  const checkpoint = chapterCheckpoint(act);
  await c.env.DB.prepare("INSERT INTO progress(team_id, started_at, act, discovered, solved_puzzles, flags) VALUES (?, datetime('now'), ?, ?, ?, ?)")
    .bind(team.id, act, JSON.stringify(checkpoint.discovered), JSON.stringify(checkpoint.solvedPuzzles), '{"practice":true}').run();
  setCookie(c, 'pa_practice', await createSession(team.id, c.env.SESSION_SECRET || 'dev-secret'), {
    httpOnly: true, secure: !isLocalHost(c), sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 3600,
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
    secure: !isLocalHost(c),
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
  return c.redirect('/');
});

app.get('/api/auth/logout', (c) => {
  deleteCookie(c, 'pa_session', { path: '/' });
  return c.redirect('/');
});

// Team-code sign-in survives for local development and offline events only.
// Disabled unless the deployment sets ALLOW_CODE_LOGIN.
app.post('/api/login', async (c) => {
  if (!isTruthy(c.env.ALLOW_CODE_LOGIN)) return c.json({ error: 'code_login_disabled' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  if (!code) return c.json({ error: 'code_required' }, 400);

  const hash = await hashCode(code, c.env.CODE_PEPPER || 'dev-pepper');
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
      .bind(JSON.stringify({ ...JSON.parse(progress?.flags || '{}'), eventEntered: true }), team.id).run();
  }
  return c.json({ team: team.name });
});

// ---------- game state ----------

app.get('/api/state', async (c) => {
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const discovered = JSON.parse(auth.progress.discovered || '[]');
  const solvedPuzzles = parseJsonArray(auth.progress.solved_puzzles);
  const penalties = Number(auth.progress.penalties ?? 0);
  const act = auth.progress.act ?? 'act0';
  return c.json({
    team: auth.teamName,
    practice: !!JSON.parse(auth.progress.flags || '{}').practice,
    eventStarted: true,
    paused: false,
    llm: !!(c.env.LLM_API_KEY && c.env.LLM_BASE_URL && c.env.LLM_MODEL),
    ...publicCase(),
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
    serverTime: new Date().toISOString(),
  });
});

// Advance the act timeline. Act 0 is a cinematic: the client reports completion.
app.post('/api/act/complete', async (c) => {
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
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
    const discovered = JSON.parse(auth.progress.discovered || '[]');
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
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const clueId = c.req.param('id');
  const discovered = JSON.parse(auth.progress.discovered || '[]');
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
  }
  return c.json({
    clue: result.clue,
    discovered: result.discovered,
    newlyUnlocked: result.newlyUnlocked,
  });
});

// Solve a puzzle: the engine normalizes the answer, applies penalties, and grants clues.
app.post('/api/puzzles/:id/solve', async (c) => {
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const puzzleId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const answer = String(body.answer ?? '');
  const discovered = JSON.parse(auth.progress.discovered || '[]');
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
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const characterId = c.req.param('id');
  if (!getCharacter(characterId)) return c.json({ error: 'unknown_character' }, 404);
  const rows = await c.env.DB.prepare(
    'SELECT role, content, source FROM messages WHERE team_id = ? AND character = ? ORDER BY id ASC LIMIT 100'
  )
    .bind(auth.teamId, characterId)
    .all();
  return c.json({ messages: rows.results });
});

// ---------- interrogation (SSE) ----------

app.post('/api/interrogate', async (c) => {
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json().catch(() => ({}));
  const characterId = String(body.character || '');
  const text = String(body.text || '').trim().slice(0, 600);
  if (!getCharacter(characterId) || !text) return c.json({ error: 'bad_request' }, 400);

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

  const discovered = JSON.parse(p.discovered || '[]');
  const historyRows = await c.env.DB.prepare(
    'SELECT role, content FROM messages WHERE team_id = ? AND character = ? ORDER BY id DESC LIMIT 12'
  )
    .bind(auth.teamId, characterId)
    .all();
  const history = historyRows.results.reverse();
  const messages = buildMessages(characterId, discovered, history, text);

  const previousPlayer = [...history].reverse().find((m) => m.role === 'player')?.content ?? '';
  const repeat = isRepeat(text, previousPlayer);
  const noise = isNoise(text);
  const priorFallbacks = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE team_id = ? AND character = ? AND role = 'npc' AND source IN ('deflect','snub')"
  )
    .bind(auth.teamId, characterId)
    .first();

  await c.env.DB.prepare(
    'INSERT INTO messages(team_id, character, role, content, source) VALUES (?,?,?,?,?)'
  )
    .bind(auth.teamId, characterId, 'player', text, 'player')
    .run();

  const llm = makeLLM(c.env, (event) => console.log(JSON.stringify({ ...event, teamId: auth.teamId })));

  return streamSSE(c, async (stream) => {
    let reply = '';
    let source = llm ? 'llm' : 'unconfigured';
    let clientGone = false;

    // A dropped client connection must not abort the LLM call or the transcript
    // insert — otherwise the conversation loses the reply entirely.
    const send = async (event, data) => {
      if (clientGone) return;
      try {
        await stream.writeSSE({ event, data: JSON.stringify(data) });
      } catch {
        clientGone = true;
      }
    };

    await send('meta', { character: characterId });

    if (llm) {
      try {
        for await (const delta of llm.stream(messages, { maxTokens: 220, temperature: 0.7 })) {
          reply += delta;
          await send('delta', { text: delta });
        }
      } catch (e) {
        console.log(JSON.stringify({ type: 'llm_failed', character: characterId, detail: String(e?.message ?? e) }));
      }
    }

    // A stream that died mid-sentence would otherwise be stored truncated
    // forever. If the reply does not look finished, replace it wholesale and
    // tell the client to swap the partial text out.
    let final = reply.trim();
    if (!final || !/([.!?…]|["'”’)\]])\s*$/.test(final)) {
      const canned = !repeat && !noise ? canonicalAnswer(characterId, text) ?? authoredAnswer(characterId, discovered, text) : null;
      if (canned) {
        source = 'canonical';
        final = canned;
      } else {
        const snub = repeat || noise;
        source = snub ? 'snub' : 'deflect';
        final = deflection(characterId, (priorFallbacks?.n ?? 0) + 1, snub);
      }
      await send('reset', { text: final });
    }

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
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  if (isTruthy(c.env.EVENT_MODE)) return c.json({ error: 'Complete the final act to submit the case conclusion.' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const culprit = String(body.culprit || '');
  const method = String(body.method || '').trim().slice(0, 800);
  const motive = String(body.motive || '').trim().slice(0, 800);

  if (!checkCulprit(culprit)) {
    return c.json({ correct: false, stage: 'culprit' });
  }

  const discovered = JSON.parse(auth.progress.discovered || '[]');
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

export default app;
