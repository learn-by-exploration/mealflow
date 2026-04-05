CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
  name, description, cuisine, region, notes,
  content='recipes', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS recipes_ai AFTER INSERT ON recipes BEGIN
  INSERT INTO recipes_fts(rowid, name, description, cuisine, region, notes)
  VALUES (new.id, new.name, new.description, new.cuisine, new.region, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS recipes_ad AFTER DELETE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, name, description, cuisine, region, notes)
  VALUES('delete', old.id, old.name, old.description, old.cuisine, old.region, old.notes);
END;

CREATE TRIGGER IF NOT EXISTS recipes_au AFTER UPDATE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, name, description, cuisine, region, notes)
  VALUES('delete', old.id, old.name, old.description, old.cuisine, old.region, old.notes);
  INSERT INTO recipes_fts(rowid, name, description, cuisine, region, notes)
  VALUES (new.id, new.name, new.description, new.cuisine, new.region, new.notes);
END;
