const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const logger = (() => { try { return require('../logger'); } catch { return console; } })();

/**
 * Initialise the database: open, schema, migrations, seeds.
 * Returns { db } so callers keep using the same variable names.
 */
function initDatabase(dbDir) {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'mealflow.db');
  const shmPath = dbPath + '-shm';
  const walPath = dbPath + '-wal';

  // ─── Stale SHM recovery ───
  if (fs.existsSync(shmPath) && fs.existsSync(walPath)) {
    try {
      fs.unlinkSync(shmPath);
      logger.info('Removed stale .db-shm file for clean WAL recovery');
    } catch (e) {
      logger.warn({ err: e }, 'Could not remove stale .db-shm file');
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}

  // ─── Auth tables ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      remember INTEGER DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      email TEXT PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      first_attempt_at DATETIME,
      locked_until DATETIME
    );
  `);

  // ─── Core tables ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'other',
      calories REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0,
      fiber REAL DEFAULT 0,
      unit TEXT DEFAULT 'g',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      servings INTEGER DEFAULT 1,
      prep_time INTEGER DEFAULT 0,
      cook_time INTEGER DEFAULT 0,
      cuisine TEXT DEFAULT '',
      difficulty TEXT DEFAULT 'easy' CHECK(difficulty IN ('easy','medium','hard')),
      image_url TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_favorite INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      quantity REAL DEFAULT 0,
      unit TEXT DEFAULT 'g',
      notes TEXT DEFAULT '',
      position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6C63FF',
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS recipe_tags (
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (recipe_id, tag_id)
    );
  `);

  // ─── Meal planning tables ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS meal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date, meal_type)
    );

    CREATE TABLE IF NOT EXISTS meal_plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
      custom_name TEXT DEFAULT '',
      servings REAL DEFAULT 1,
      position INTEGER DEFAULT 0
    );
  `);

  // ─── Shopping lists ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      date_from TEXT,
      date_to TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
      ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      unit TEXT DEFAULT '',
      category TEXT DEFAULT 'other',
      checked INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0
    );
  `);

  // ─── Nutrition tracking ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS nutrition_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
      custom_name TEXT DEFAULT '',
      servings REAL DEFAULT 1,
      calories REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS nutrition_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      calories_target REAL DEFAULT 2000,
      protein_target REAL DEFAULT 50,
      carbs_target REAL DEFAULT 250,
      fat_target REAL DEFAULT 65,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    );
  `);

  // ─── System tables ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      resource TEXT,
      resource_id INTEGER,
      ip TEXT,
      ua TEXT,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ─── Run SQL migrations ───
  const runMigrations = require('./migrate');
  const migrationResult = runMigrations(db);
  if (migrationResult.applied > 0) {
    logger.info({ applied: migrationResult.applied, total: migrationResult.total }, 'Migrations applied');
  }

  // ─── Integrity check ───
  try {
    const result = db.pragma('integrity_check');
    if (result[0].integrity_check !== 'ok') {
      logger.warn({ result }, 'Database integrity check found issues');
    }
  } catch (e) {
    logger.error({ err: e }, 'Database integrity check failed');
  }

  return { db };
}

module.exports = initDatabase;
