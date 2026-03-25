-- Completion reports (stored for historical access)
CREATE TABLE IF NOT EXISTS completion_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL UNIQUE REFERENCES cleaning_sessions(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  report_data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Inventory items per property (supply closet items)
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  par_level INTEGER,
  last_count INTEGER,
  last_counted_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Per-check inventory count records
CREATE TABLE IF NOT EXISTS inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  session_id INTEGER REFERENCES cleaning_sessions(id),
  count INTEGER NOT NULL,
  previous_count INTEGER,
  consumption_delta INTEGER,
  counted_by TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Photos taken during inventory checks
CREATE TABLE IF NOT EXISTS inventory_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_count_id INTEGER NOT NULL REFERENCES inventory_counts(id),
  file_id TEXT NOT NULL,
  ai_analysis TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Add inventory frequency settings to properties
ALTER TABLE properties ADD COLUMN inventory_frequency TEXT DEFAULT 'every';
ALTER TABLE properties ADD COLUMN inventory_frequency_n INTEGER DEFAULT 1;
