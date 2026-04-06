-- IC-04: Seasonal ingredient flags
ALTER TABLE ingredients ADD COLUMN season TEXT DEFAULT 'year-round';
