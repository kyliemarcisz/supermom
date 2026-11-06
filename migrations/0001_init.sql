-- super mom schema
CREATE TABLE kids (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'kid',          -- 'kid' or 'parent'
  last_week_points INTEGER NOT NULL DEFAULT 0, -- tie-breaker for rotation
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE chores (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  points INTEGER NOT NULL,
  icon TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0            -- order among chores with equal points
);

CREATE TABLE assignments (
  id INTEGER PRIMARY KEY,
  chore_id INTEGER NOT NULL REFERENCES chores(id),
  kid_id INTEGER NOT NULL REFERENCES kids(id),
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  swapped_from INTEGER REFERENCES kids(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  kid_id INTEGER NOT NULL REFERENCES kids(id),
  direction TEXT NOT NULL,                   -- 'in' (kid -> app) or 'out' (app -> kid)
  body TEXT NOT NULL,
  intent TEXT,
  via TEXT NOT NULL DEFAULT 'sim',           -- 'sim' or 'sms'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                        -- assign, done, swap, excuse, question, reminder
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
