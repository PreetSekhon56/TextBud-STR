CREATE TABLE IF NOT EXISTS guest_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  chat_id INTEGER NOT NULL,
  guest_telegram_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  matched_faq_id INTEGER REFERENCES faq_entries(id),
  was_answered INTEGER NOT NULL DEFAULT 0,
  owner_notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
