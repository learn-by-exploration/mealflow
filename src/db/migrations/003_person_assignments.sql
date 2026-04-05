CREATE TABLE IF NOT EXISTS person_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_plan_item_id INTEGER NOT NULL REFERENCES meal_plan_items(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  servings REAL DEFAULT 1,
  spice_override INTEGER CHECK(spice_override IS NULL OR (spice_override BETWEEN 1 AND 5)),
  sugar_override INTEGER CHECK(sugar_override IS NULL OR (sugar_override BETWEEN 1 AND 5)),
  notes TEXT DEFAULT '',
  UNIQUE(meal_plan_item_id, person_id)
);
