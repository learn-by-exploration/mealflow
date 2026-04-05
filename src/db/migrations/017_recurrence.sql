CREATE TABLE IF NOT EXISTS recurrence_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_plan_item_id INTEGER NOT NULL REFERENCES meal_plan_items(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL CHECK(pattern IN ('daily','specific_days','weekly','biweekly','monthly')),
  days_of_week TEXT DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
