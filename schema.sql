-- Prompt Arena: Mystery — D1 schema (local: npm run db:local)
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS progress (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id),
  unlocked TEXT NOT NULL DEFAULT '[]',    -- JSON array of unlocked fact ids (server-authoritative)
  clues_found INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  accusation TEXT,                        -- JSON {culprit, method, motive}
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
  role TEXT NOT NULL,                     -- 'player' | 'npc' | 'system'
  content TEXT NOT NULL,
  source TEXT,                            -- cache | llm | fallback (audit)
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
INSERT OR IGNORE INTO config(key, value) VALUES ('event_started', '0');
