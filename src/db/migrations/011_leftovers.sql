ALTER TABLE meal_plan_items ADD COLUMN is_leftover INTEGER DEFAULT 0;
ALTER TABLE meal_plan_items ADD COLUMN leftover_from_item_id INTEGER REFERENCES meal_plan_items(id) ON DELETE SET NULL;
