-- IC-11: Hindi/regional name aliases for ingredients
ALTER TABLE ingredients ADD COLUMN aliases TEXT DEFAULT '[]';
