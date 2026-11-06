-- kids can offer to do a sibling's chore for a price, or pay a sibling to take one of theirs
CREATE TABLE bids (
  id INTEGER PRIMARY KEY,
  chore_id INTEGER NOT NULL REFERENCES chores(id),
  from_kid INTEGER NOT NULL REFERENCES kids(id),   -- who made the offer
  to_kid INTEGER NOT NULL REFERENCES kids(id),     -- who has to say deal
  kind TEXT NOT NULL,                              -- 'do': from_kid does to_kid's chore, to_kid pays
                                                   -- 'pay': from_kid pays, to_kid does from_kid's chore
  cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',             -- open, accepted, declined
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
