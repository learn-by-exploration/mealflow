ALTER TABLE ingredients ADD COLUMN price_per_unit REAL;
ALTER TABLE ingredients ADD COLUMN price_currency TEXT DEFAULT 'INR';
ALTER TABLE ingredients ADD COLUMN price_updated_at TEXT;
