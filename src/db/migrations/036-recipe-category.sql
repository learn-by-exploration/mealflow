-- IC-15: Recipe category (main, side_dish, condiment, beverage, dessert, snack)
ALTER TABLE recipes ADD COLUMN category TEXT DEFAULT 'main';
