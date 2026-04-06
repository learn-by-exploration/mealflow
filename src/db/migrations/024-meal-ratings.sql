CREATE TABLE meal_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_plan_item_id INTEGER NOT NULL REFERENCES meal_plan_items(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(meal_plan_item_id, person_id)
);
