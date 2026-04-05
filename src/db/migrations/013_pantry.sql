CREATE TABLE IF NOT EXISTS pantry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT '',
  category TEXT DEFAULT 'other',
  expires_at TEXT,
  location TEXT DEFAULT 'kitchen' CHECK(location IN ('kitchen','fridge','freezer','store_room')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
