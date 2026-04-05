CREATE TABLE IF NOT EXISTS persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '🙂',
  dietary_type TEXT DEFAULT 'vegetarian'
    CHECK(dietary_type IN ('vegetarian','non_vegetarian','eggetarian','vegan','jain','sattvic','swaminarayan')),
  restrictions TEXT DEFAULT '[]',
  age_group TEXT DEFAULT 'adult'
    CHECK(age_group IN ('toddler','child','teen','adult','senior')),
  spice_level INTEGER DEFAULT 3 CHECK(spice_level BETWEEN 1 AND 5),
  sugar_level INTEGER DEFAULT 3 CHECK(sugar_level BETWEEN 1 AND 5),
  calorie_target REAL,
  protein_target REAL,
  carbs_target REAL,
  fat_target REAL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
