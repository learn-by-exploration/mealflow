-- IC-07: Jain dietary rules - mark root vegetables
ALTER TABLE ingredients ADD COLUMN is_root_vegetable INTEGER DEFAULT 0;
