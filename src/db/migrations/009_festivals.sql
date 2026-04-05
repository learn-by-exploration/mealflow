CREATE TABLE IF NOT EXISTS festivals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  name_hindi TEXT DEFAULT '',
  type TEXT NOT NULL CHECK(type IN ('hindu','muslim','christian','sikh','jain','buddhist','secular','regional')),
  region TEXT DEFAULT 'pan_india',
  date_rule TEXT NOT NULL,
  duration_days INTEGER DEFAULT 1,
  description TEXT DEFAULT '',
  is_fasting INTEGER DEFAULT 0,
  fasting_type TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS fasting_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('allow','deny')),
  category TEXT,
  ingredient_name TEXT,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS person_festivals (
  person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  PRIMARY KEY(person_id, festival_id)
);

CREATE TABLE IF NOT EXISTS festival_recipes (
  festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  PRIMARY KEY(festival_id, recipe_id)
);
