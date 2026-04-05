const fs = require('fs');
const path = require('path');
const logger = require('../logger');

/**
 * SQL Migration Runner
 * Tracks applied migrations in a `_migrations` table.
 * Migration files: src/db/migrations/NNN_description.sql
 */
function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
    return { applied: 0, total: 0 };
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) return { applied: 0, total: 0 };

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map(r => r.name)
  );

  let count = 0;
  const applyStmt = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim();
    if (!sql) continue;

    try {
      db.exec(sql);
      applyStmt.run(file);
      count++;
      logger.info({ migration: file }, 'Migration applied');
    } catch (err) {
      logger.error({ migration: file, err }, 'Migration failed');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
  }

  return { applied: count, total: files.length };
}

module.exports = runMigrations;
