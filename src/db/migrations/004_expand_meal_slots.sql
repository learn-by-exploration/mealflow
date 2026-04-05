PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS meal_plans_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN (
    'breakfast','morning_snack','lunch','evening_snack','dinner','snack','custom'
  )),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date, meal_type)
);
INSERT INTO meal_plans_v2 (id, user_id, date, meal_type, created_at) SELECT id, user_id, date, meal_type, created_at FROM meal_plans;
DROP TABLE meal_plans;
ALTER TABLE meal_plans_v2 RENAME TO meal_plans;

PRAGMA foreign_keys = ON;
