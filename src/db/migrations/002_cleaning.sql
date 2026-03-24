CREATE TABLE IF NOT EXISTS cleaning_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  cleaner_id INTEGER NOT NULL REFERENCES cleaners(id),
  chat_id INTEGER NOT NULL,
  clean_type TEXT NOT NULL CHECK(clean_type IN ('standard', 'deep')),
  current_room_id INTEGER REFERENCES rooms(id),
  entry_video_file_id TEXT,
  checked_in_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  summary TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milestone_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES cleaning_sessions(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  file_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comparison_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_photo_id INTEGER NOT NULL REFERENCES milestone_photos(id),
  staging_photo_id INTEGER NOT NULL REFERENCES staging_photos(id),
  passed INTEGER NOT NULL DEFAULT 0,
  issues TEXT,
  raw_response TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_checklist_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES cleaning_sessions(id),
  checklist_item_id INTEGER NOT NULL REFERENCES checklist_items(id),
  completed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, checklist_item_id)
);
