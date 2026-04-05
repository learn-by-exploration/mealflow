PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS nutrition_log_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN (
    'breakfast','morning_snack','lunch','evening_snack','dinner','snack','custom'
  )),
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  custom_name TEXT DEFAULT '',
  servings REAL DEFAULT 1,
  calories REAL DEFAULT 0,
  protein REAL DEFAULT 0,
  carbs REAL DEFAULT 0,
  fat REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO nutrition_log_v2 SELECT * FROM nutrition_log;
DROP TABLE nutrition_log;
ALTER TABLE nutrition_log_v2 RENAME TO nutrition_log;

PRAGMA foreign_keys = ON;
