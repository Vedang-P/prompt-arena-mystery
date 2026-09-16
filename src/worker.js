// Prompt Arena: Mystery — Worker API.
// Auth, game state, clue discovery, streaming interrogation, accusations, leaderboard.

import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { caseData, getCharacter } from './case.js';
import {
  buildMessages,
  canonicalAnswer,
  checkCulprit,
  conclusionMatches,
  deflection,
  discover,
  judgeMessages,
  publicCase,
  unlockedFactList,
} from './engine.js';
import { makeLLM } from './llm.js';
import { createSession, hashCode, readSession } from './auth.js';

const app = new Hono();

const RATE_MIN_MS = 1500;
const RATE_WINDOW_MS = 60_000;
const RATE_WINDOW_MAX = 12;

app.get('/api/health', (c) => c.json({ ok: true, service: 'prompt-arena-mystery' }));

// ---------- helpers ----------

async function requireTeam(c) {
  const teamId = await readSession(
    getCookie(c, 'pa_session'),
    c.env.SESSION_SECRET || 'dev-secret'
  );
  if (!teamId) return null;
  const row = await c.env.DB.prepare(
    'SELECT t.name AS team_name, p.* FROM teams t JOIN progress p ON p.team_id = t.id WHERE t.id = ?'
  )
    .bind(teamId)
    .first();
  if (!row) return null;
  return { teamId, teamName: row.team_name, progress: row };
}

const isLocalHost = (c) => /^(127\.0\.0\.1|localhost)$/.test(new URL(c.req.url).hostname);

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

app.post('/api/login', async (c) => {
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

  setCookie(c, 'pa_session', await createSession(team.id, c.env.SESSION_SECRET || 'dev-secret'), {
    httpOnly: true,
    secure: !isLocalHost(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: 12 * 3600,
  });
  return c.json({ team: team.name });
});

// ---------- game state ----------

app.get('/api/state', async (c) => {
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const discovered = JSON.parse(auth.progress.discovered || '[]');
  return c.json({
    team: auth.teamName,
    eventStarted: true,
    paused: false,
    llm: !!(c.env.LLM_API_KEY && c.env.LLM_BASE_URL && c.env.LLM_MODEL),
    ...publicCase(),
    discovered,
    unlocked: unlockedFactList(discovered),
    hintsUsed: auth.progress.hints_used,
    solved: !!auth.progress.solved,
    serverTime: new Date().toISOString(),
  });
});

app.post('/api/clues/:id/discover', async (c) => {
  const auth = await requireTeam(c);
  if (!auth) return c.json({ error: 'unauthorized' }, 401);
  const clueId = c.req.param('id');
  const discovered = JSON.parse(auth.progress.discovered || '[]');
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
      const canned = canonicalAnswer(characterId, text);
      source = canned ? 'canonical' : 'deflect';
      final = canned ?? deflection(characterId);
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
    `SELECT t.name, p.solved, p.solved_at,
            json_array_length(p.discovered) AS clues_found, p.hints_used
     FROM progress p JOIN teams t ON t.id = p.team_id
     ORDER BY p.solved_at IS NULL, p.solved_at ASC, clues_found DESC, p.hints_used ASC`
  ).all();
  return c.json({ teams: rows.results });
});

export default app;
