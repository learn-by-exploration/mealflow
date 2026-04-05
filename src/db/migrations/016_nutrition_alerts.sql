CREATE TABLE IF NOT EXISTS nutrition_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  nutrient TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('low','high')),
  period TEXT NOT NULL,
  value REAL NOT NULL,
  target REAL NOT NULL,
  date TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
