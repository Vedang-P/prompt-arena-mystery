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
// SESSION_SECRET/CODE_PEPPER answer with an explicit misconfiguration error
// instead of silently signing sessions with a public literal.
//
// Team codes: the demo team TEAM-042 (PANDA-7K2) is always seeded; add real
// event codes with the TEAM_CODES env var (comma separated).

import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { hashCode } from '../src/auth.js';
import { createPostgresDB, POSTGRES_DDL } from './db-postgres.js';

const require = createRequire(import.meta.url);

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
`;

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

function teamEntries(env) {
  const entries = /^(1|true)$/i.test(env.EVENT_MODE || '') ? [] : [{ name: 'TEAM-042', code: 'PANDA-7K2' }];
  for (const raw of String(env.TEAM_CODES || '').split(',')) {
    const code = raw.trim();
    if (!code || code.toUpperCase() === 'PANDA-7K2') continue;
    const [name, assigned] = code.split('=');
    entries.push({ name: assigned ? name.trim() : code.toUpperCase(), code: assigned ? assigned.trim() : code });
  }
  return entries;
}

async function seed(db, env) {
  const pepper = env.CODE_PEPPER || 'dev-pepper';
  const entries = teamEntries(env);
  if (!entries.length) return;
  const values = await Promise.all(entries.map(async ({ name, code }) => [name, await hashCode(code, pepper)]));
  await db.prepare(`INSERT OR IGNORE INTO teams(name, code_hash) VALUES ${values.map(()=>'(?,?)').join(',')}`)
    .bind(...values.flat()).run();
  const teams = await db.prepare(`SELECT id FROM teams WHERE name IN (${values.map(()=>'?').join(',')})`)
    .bind(...values.map(v=>v[0])).all();
  await db.prepare(`INSERT OR IGNORE INTO progress(team_id) VALUES ${teams.results.map(()=>'(?)').join(',')}`)
    .bind(...teams.results.map(t=>t.id)).run();
  console.log(`seeded ${entries.length} team(s)`);
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
    CODE_PEPPER: process.env.CODE_PEPPER ?? '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
    GOOGLE_AUTH_URL: process.env.GOOGLE_AUTH_URL ?? '',
    GOOGLE_TOKEN_URL: process.env.GOOGLE_TOKEN_URL ?? '',
    GOOGLE_USERINFO_URL: process.env.GOOGLE_USERINFO_URL ?? '',
    ALLOW_CODE_LOGIN: process.env.ALLOW_CODE_LOGIN ?? '',
    EVENT_MODE: process.env.EVENT_MODE ?? '',
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? '',
    LLM_API_KEY: process.env.LLM_API_KEY ?? '',
    LLM_MODEL: process.env.LLM_MODEL ?? '',
    LLM_FALLBACK_MODELS: process.env.LLM_FALLBACK_MODELS ?? '',
    LLM_EXTRA_HEADERS: process.env.LLM_EXTRA_HEADERS ?? '',
    LLM_MAX_CONCURRENT: process.env.LLM_MAX_CONCURRENT ?? '',
  };
}
