// Vercel (Node runtime) environment.
//
// Storage, in order of preference:
//   1. Postgres when DATABASE_URL / POSTGRES_URL / POSTGRES_PRISMA_URL is set
//      (Vercel Postgres / Neon) — durable, survives cold starts.
//   2. node:sqlite in /tmp otherwise — zero-config demo mode, per-instance and
//      reset on cold start.
//
// Secrets are passed through exactly as configured; the worker decides whether
// the insecure-host development fallback is allowed. Public deployments without
// SESSION_SECRET answer with an explicit misconfiguration error
// instead of silently signing sessions with a public literal.
//
// Sign-in is guest (player-chosen username) or Google OAuth — no seeded teams,
// no team codes. The only seed is the developer sandbox, which exists while
// DEV_TEAM_CODE is set (docs/DEVTOOLS.md).

import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { hashCode } from '../src/auth.js';
import { createPostgresDB, POSTGRES_DDL, POSTGRES_TEAM_MIGRATIONS } from './db-postgres.js';

const require = createRequire(import.meta.url);

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  disqualified INTEGER NOT NULL DEFAULT 0,
  disqualified_at TEXT,
  disqualify_reason TEXT,
  exit_strikes INTEGER NOT NULL DEFAULT 0,
  pending_exit_at TEXT,
  pending_exit_kind TEXT,
  exempt INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  admin_note TEXT
);
CREATE TABLE IF NOT EXISTS progress (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id),
  act TEXT NOT NULL DEFAULT 'act0',
  flags TEXT NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  penalties INTEGER NOT NULL DEFAULT 0,
  discovered TEXT NOT NULL DEFAULT '[]',
  solved_puzzles TEXT NOT NULL DEFAULT '[]',
  hints_used INTEGER NOT NULL DEFAULT 0,
  accusation TEXT,
  ending TEXT,
  solved INTEGER NOT NULL DEFAULT 0,
  solved_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  last_prompt_ms INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  character TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  req_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_team ON messages(team_id, id);
-- Dedupe before adding the idempotency index so an older database can still boot.
DELETE FROM messages WHERE req_id IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM messages WHERE req_id IS NOT NULL GROUP BY team_id, req_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_req ON messages(team_id, req_id) WHERE req_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, id);
CREATE INDEX IF NOT EXISTS idx_events_team ON events(team_id, id);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  team_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  team_name TEXT,
  act TEXT,
  message TEXT NOT NULL,
  penalties INTEGER NOT NULL DEFAULT 0,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Databases created before the event-control tables existed gain their columns
// on boot; duplicate-column errors are expected and ignored.
const SQLITE_TEAM_COLUMNS = [
  'disqualified INTEGER NOT NULL DEFAULT 0',
  'disqualified_at TEXT',
  'disqualify_reason TEXT',
  'exit_strikes INTEGER NOT NULL DEFAULT 0',
  'pending_exit_at TEXT',
  'pending_exit_kind TEXT',
  'exempt INTEGER NOT NULL DEFAULT 0',
  'last_seen_at TEXT',
  'admin_note TEXT',
];

function openSqlite(file) {
  let sqlite;
  try {
    sqlite = require('node:sqlite');
  } catch {
    throw new Error(
      'No database configured: deploy on the Node.js 22 runtime or set DATABASE_URL (see README).'
    );
  }
  const raw = new sqlite.DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec(SQLITE_DDL);
  for (const column of SQLITE_TEAM_COLUMNS) {
    try {
      raw.exec(`ALTER TABLE teams ADD COLUMN ${column}`);
    } catch {
      // Column already exists on a database created after this migration shipped.
    }
  }

  const cleanArg = (value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  };

  class SqliteStatement {
    constructor(sql) {
      this.sql = sql;
      this.args = [];
    }

    bind(...args) {
      const next = new SqliteStatement(this.sql);
      next.args = args.map(cleanArg);
      return next;
    }

    async first() {
      const row = raw.prepare(this.sql).get(...this.args);
      return row === undefined ? null : row;
    }

    async all() {
      return { results: raw.prepare(this.sql).all(...this.args) };
    }

    async run() {
      const info = raw.prepare(this.sql).run(...this.args);
      return { success: true, meta: info };
    }
  }

  return { prepare: (sql) => new SqliteStatement(sql) };
}

const DEV_TEAM_NAME = 'Dev Sandbox';

// The developer sandbox: one secret that opens a full-access test save. It only
// exists while DEV_TEAM_CODE is set and is excluded from the leaderboard (its
// progress flags carry dev:true).
function devEntry(env) {
  const code = String(env.DEV_TEAM_CODE || '').trim();
  return code ? { name: DEV_TEAM_NAME, code, dev: true } : null;
}

async function seed(db, env) {
  const entry = devEntry(env);
  if (!entry) return;
  const values = [[entry.name, await hashCode(entry.code, 'dev-pepper')]];
  await db.prepare(`INSERT OR IGNORE INTO teams(name, code_hash) VALUES ${values.map(()=>'(?,?)').join(',')}`)
    .bind(...values.flat()).run();
  const teams = await db.prepare(`SELECT id, name, code_hash FROM teams WHERE name IN (${values.map(()=>'?').join(',')})`)
    .bind(...values.map(v=>v[0])).all();
  // Team names are unique, so the insert above can never revise a hash: a code
  // changed in the environment (a new DEV_TEAM_CODE) would keep failing at
  // login while the old hash stayed behind. Realign the seeded team with the
  // environment on every boot.
  const rowsByName = new Map(teams.results.map((row) => [row.name, row]));
  for (const [name, hash] of values) {
    const row = rowsByName.get(name);
    if (row && row.code_hash !== hash) {
      await db.prepare('UPDATE teams SET code_hash = ? WHERE id = ?').bind(hash, row.id).run();
    }
  }
  await db.prepare(`INSERT OR IGNORE INTO progress(team_id) VALUES ${teams.results.map(()=>'(?)').join(',')}`)
    .bind(...teams.results.map(t=>t.id)).run();
  const team = teams.results.find((row) => row.name === entry.name);
  if (team) {
    const row = await db.prepare('SELECT flags FROM progress WHERE team_id = ?').bind(team.id).first();
    const flags = { ...(JSON.parse(row?.flags || '{}')), dev: true };
    await db.prepare('UPDATE progress SET flags = ? WHERE team_id = ?').bind(JSON.stringify(flags), team.id).run();
  }
  console.log(`seeded 1 team: ${entry.name}`);
}

let dbPromise = null;

// The idempotency index is created outside the main DDL batch, so a legacy
// database holding duplicate req_ids degrades to a warning instead of a
// deployment-wide failure. The DELETE keeps the earliest row per request.
const DEDUPE_REQ_ID_SQL =
  'DELETE FROM messages WHERE req_id IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM messages WHERE req_id IS NOT NULL GROUP BY team_id, req_id)';
const REQ_ID_INDEX_SQL =
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_req ON messages(team_id, req_id) WHERE req_id IS NOT NULL';

async function migratePostgres(pg) {
  try {
    await pg.pool.query(DEDUPE_REQ_ID_SQL);
    await pg.pool.query(REQ_ID_INDEX_SQL);
  } catch (error) {
    console.warn(JSON.stringify({ type: 'db_migration_warning', detail: String(error?.message ?? error) }));
  }
  for (const sql of POSTGRES_TEAM_MIGRATIONS) {
    try {
      await pg.pool.query(sql);
    } catch (error) {
      console.warn(JSON.stringify({ type: 'db_migration_warning', detail: String(error?.message ?? error) }));
    }
  }
}

function getDB(env) {
  if (!dbPromise) {
    dbPromise = (async () => {
      const pgUrl = env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL;
      let db;
      if (pgUrl) {
        const pg = createPostgresDB(pgUrl);
        await pg.exec(POSTGRES_DDL);
        await migratePostgres(pg);
        db = pg.db;
      } else {
        const file = env.SQLITE_PATH || path.join(os.tmpdir(), 'prompt-arena-mystery.db');
        db = openSqlite(file);
      }
      await seed(db, env);
      return db;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function getEnv() {
  const db = await getDB(process.env);
  return {
    DB: db,
    // Empty when unset: src/worker.js falls back to the development literals on
    // loopback/private hosts only, and rejects public requests otherwise.
    SESSION_SECRET: process.env.SESSION_SECRET ?? '',
    DEV_TEAM_CODE: process.env.DEV_TEAM_CODE ?? '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
    GOOGLE_AUTH_URL: process.env.GOOGLE_AUTH_URL ?? '',
    GOOGLE_TOKEN_URL: process.env.GOOGLE_TOKEN_URL ?? '',
    GOOGLE_USERINFO_URL: process.env.GOOGLE_USERINFO_URL ?? '',
    EVENT_MODE: process.env.EVENT_MODE ?? '',
    ADMIN_USERNAME: process.env.ADMIN_USERNAME ?? '',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? '',
    LLM_API_KEY: process.env.LLM_API_KEY ?? '',
    LLM_API_KEYS: process.env.LLM_API_KEYS ?? '',
    OPENCODE_API_KEY: process.env.OPENCODE_API_KEY ?? '',
    LLM_USER_AGENT: process.env.LLM_USER_AGENT ?? '',
    LLM_MAX_OUTPUT_TOKENS: process.env.LLM_MAX_OUTPUT_TOKENS ?? '',
    LLM_TEAM_DAILY_MAX: process.env.LLM_TEAM_DAILY_MAX ?? '',
    LLM_MODEL: process.env.LLM_MODEL ?? '',
    LLM_MODELS: process.env.LLM_MODELS ?? '',
    LLM_FALLBACK_MODELS: process.env.LLM_FALLBACK_MODELS ?? '',
    LLM_EXTRA_HEADERS: process.env.LLM_EXTRA_HEADERS ?? '',
    LLM_MAX_CONCURRENT: process.env.LLM_MAX_CONCURRENT ?? '',
    LLM_FIRST_TOKEN_MS: process.env.LLM_FIRST_TOKEN_MS ?? '',
    LLM_TURN_BUDGET_MS: process.env.LLM_TURN_BUDGET_MS ?? '',
    LLM_COOLDOWN_MS: process.env.LLM_COOLDOWN_MS ?? '',
    LLM_MAX_COOLDOWN_MS: process.env.LLM_MAX_COOLDOWN_MS ?? '',
    LLM_MAX_ATTEMPTS: process.env.LLM_MAX_ATTEMPTS ?? '',
  };
}
