// Postgres backend for the Vercel deployment (Vercel Postgres / Neon and any
// DATABASE_URL). Speaks the same prepare/bind/first/all/run interface as the
// sqlite development backend, translating the handful of SQLite-isms the
// worker uses.

import pg from 'pg';

const { Pool, types } = pg;

// COUNT(*) comes back as bigint (string) by default; arithmetic in the worker wants a number.
types.setTypeParser(20, (value) => parseInt(value, 10));

export const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
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
  last_prompt_ms BIGINT NOT NULL DEFAULT 0,
  window_start BIGINT NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL,
  character TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  req_id TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_msg_team ON messages(team_id, id);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  team_id INTEGER,
  type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, id);
CREATE INDEX IF NOT EXISTS idx_events_team ON events(team_id, id);
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id SERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  team_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);
`;

const TS_NOW = "to_char(now(), 'YYYY-MM-DD HH24:MI:SS')";

// Existing deployments: columns added after the original release. Errors are
// swallowed by the caller, so a duplicate column is a no-op.
export const POSTGRES_TEAM_MIGRATIONS = [
  'ALTER TABLE teams ADD COLUMN IF NOT EXISTS disqualified INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE teams ADD COLUMN IF NOT EXISTS disqualified_at TEXT',
  'ALTER TABLE teams ADD COLUMN IF NOT EXISTS disqualify_reason TEXT',
  'ALTER TABLE teams ADD COLUMN IF NOT EXISTS exit_strikes INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE teams ADD COLUMN IF NOT EXISTS pending_exit_at TEXT',
  'ALTER TABLE teams ADD COLUMN IF NOT EXISTS pending_exit_kind TEXT',
  'ALTER TABLE teams ADD COLUMN IF NOT EXISTS exempt INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE teams ADD COLUMN IF NOT EXISTS last_seen_at TEXT',
  'ALTER TABLE teams ADD COLUMN IF NOT EXISTS admin_note TEXT',
];

export function translateSql(sql) {
  let out = String(sql);
  out = out.replace(
    /json_array_length\(\s*COALESCE\(\s*([^,()]+?)\s*,\s*'\[\]'\s*\)\s*\)/g,
    "COALESCE(jsonb_array_length(NULLIF($1, '')::jsonb), 0)"
  );
  out = out.replace(
    /json_array_length\(\s*([a-zA-Z0-9_.]+)\s*\)/g,
    "COALESCE(jsonb_array_length(NULLIF($1, '')::jsonb), 0)"
  );
  out = out.replace(/datetime\('now'\)/g, TS_NOW);
  if (/^\s*INSERT OR IGNORE INTO/i.test(out)) {
    out = out.replace(/^\s*INSERT OR IGNORE INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
  }
  let n = 0;
  out = out.replace(/\?/g, () => `$${++n}`);
  return out;
}

const cleanArg = (value) => {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
};

class PgStatement {
  constructor(pool, sql) {
    this.pool = pool;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    const next = new PgStatement(this.pool, this.sql);
    next.args = args.map(cleanArg);
    return next;
  }

  async first() {
    const { rows } = await this.pool.query(translateSql(this.sql), this.args);
    return rows[0] ?? null;
  }

  async all() {
    const { rows } = await this.pool.query(translateSql(this.sql), this.args);
    return { results: rows };
  }

  async run() {
    const result = await this.pool.query(translateSql(this.sql), this.args);
    return { success: true, meta: { changes: result.rowCount ?? 0 } };
  }
}

export function createPostgresDB(connectionString) {
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 6,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return {
    db: { prepare: (sql) => new PgStatement(pool, sql) },
    pool,
    exec: (ddl) => pool.query(ddl),
  };
}
