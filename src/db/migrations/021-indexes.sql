CREATE INDEX IF NOT EXISTS idx_meals_date ON meal_plans(date);
CREATE INDEX IF NOT EXISTS idx_meals_user ON meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_user ON ingredients(user_id);
CREATE INDEX IF NOT EXISTS idx_pantry_expiry ON pantry(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);
