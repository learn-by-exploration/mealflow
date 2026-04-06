-- IC-02: Meal type classification
ALTER TABLE recipes ADD COLUMN meal_suitability TEXT DEFAULT '[]';
