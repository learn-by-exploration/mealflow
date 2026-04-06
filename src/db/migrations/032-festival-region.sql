-- IC-06: Regional festival variations
-- Note: festivals table already has a 'region' column from migration 009
-- This adds support for region-specific fasting rule overrides
ALTER TABLE fasting_rules ADD COLUMN region TEXT DEFAULT 'pan-india';
