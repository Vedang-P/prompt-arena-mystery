-- Prompt Arena: Mystery — D1 schema (local: npm run db:local)
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS progress (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id),
  act TEXT NOT NULL DEFAULT 'act0',          -- current act id (act0, act1, ...)
  flags TEXT NOT NULL DEFAULT '{}',          -- JSON of story flags (puzzles, choices, penalties)
  score INTEGER NOT NULL DEFAULT 0,
  penalties INTEGER NOT NULL DEFAULT 0,
  discovered TEXT NOT NULL DEFAULT '[]',    -- JSON array of clue ids (server-authoritative)
  solved_puzzles TEXT NOT NULL DEFAULT '[]', -- JSON array of solved puzzle ids (server-authoritative)
  hints_used INTEGER NOT NULL DEFAULT 0,
  accusation TEXT,                          -- JSON of the latest accusation
  ending TEXT,                              -- ending id once the run finishes (e.g. ending_main)
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
  role TEXT NOT NULL,                     -- 'player' | 'npc'
  content TEXT NOT NULL,
  source TEXT,                            -- player | llm | canonical | deflect (audit)
  req_id TEXT,                            -- idempotency key from client
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_team ON messages(team_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_req ON messages(team_id, req_id) WHERE req_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  type TEXT NOT NULL,                     -- login | flood | llm_error | admin | hint | ...
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, id);

CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO config(key, value) VALUES ('paused', '0');
INSERT OR IGNORE INTO config(key, value) VALUES ('event_started', '1');

-- Migrations for databases created before puzzle progress and endings existed.
-- CREATE TABLE IF NOT EXISTS never alters an existing table, so an already-created
-- local or remote D1 needs these once (penalties already existed in the original schema):
-- ALTER TABLE progress ADD COLUMN solved_puzzles TEXT NOT NULL DEFAULT '[]';
-- ALTER TABLE progress ADD COLUMN ending TEXT;
-- A fresh database (new .wrangler state, new D1 instance) gets the columns from the
-- CREATE above and must NOT run the ALTERs.
