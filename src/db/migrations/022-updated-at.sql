-- Add updated_at columns where missing
ALTER TABLE ingredients ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE meal_plans ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE shopping_lists ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE persons ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Triggers to auto-update updated_at on row change
CREATE TRIGGER IF NOT EXISTS trg_recipes_updated_at AFTER UPDATE ON recipes
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE recipes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ingredients_updated_at AFTER UPDATE ON ingredients
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE ingredients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_meal_plans_updated_at AFTER UPDATE ON meal_plans
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE meal_plans SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_shopping_lists_updated_at AFTER UPDATE ON shopping_lists
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE shopping_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_persons_updated_at AFTER UPDATE ON persons
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE persons SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
