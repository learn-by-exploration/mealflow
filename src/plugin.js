'use strict';

/**
 * MealFlow Plugin Adapter for Synclyf Monolith.
 *
 * Wraps all MealFlow routes into a plugin interface.
 * Route style: ABSOLUTE paths (/api/recipes, /api/meals, etc.)
 * The monolith mounts this at /api/mf and prepends /api/ to req.url.
 */

const { Router } = require('express');

module.exports = function initPlugin(context) {
  if (!context?.authDb || !context?.config || !context?.logger) {
    throw new Error('MealFlow plugin context incomplete: missing authDb, config, or logger');
  }

  const { authDb, config, logger } = context;

  // ─── Initialize MealFlow's own database ───
  const initDatabase = require('./db');
  const { db } = initDatabase(config.dataDir);

  // ─── Create MealFlow dependencies ───
  const createHelpers = require('./helpers');
  const helpers = createHelpers(db);
  const createAuditLogger = require('./services/audit');
  const audit = createAuditLogger(db);

  const deps = { db, dbDir: config.dataDir, audit, ...helpers };

  // ─── Ensure user exists in MealFlow DB ───
  function ensureUser(req, _res, next) {
    if (!req.userId) return next();
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.userId);
    if (!existing) {
      const authUser = authDb.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(req.userId);
      if (authUser) {
        db.prepare(
          'INSERT OR IGNORE INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(authUser.id, authUser.email, 'MONOLITH_MANAGED', authUser.display_name || '', authUser.created_at);
      }
    }
    // Set householdId from MealFlow's users table (if exists)
    const mfUser = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (mfUser) {
      req.householdId = mfUser.household_id;
    }
    next();
  }

  // ─── Build router with all MealFlow routes ───
  const router = Router();

  // Auth routes handled by monolith — skip MealFlow's auth
  // Mount all feature routes (absolute paths)
  router.use(require('./routes/recipes')(deps));
  router.use(require('./routes/ingredients')(deps));
  router.use(require('./routes/meals')(deps));
  router.use(require('./routes/tags')(deps));
  router.use(require('./routes/nutrition')(deps));
  router.use(require('./routes/shopping')(deps));
  router.use(require('./routes/stats')(deps));
  router.use(require('./routes/data')(deps));
  router.use(require('./routes/households')(deps));
  router.use(require('./routes/persons')(deps));
  router.use(require('./routes/festivals')(deps));
  router.use(require('./routes/polls')(deps));
  router.use(require('./routes/templates')(deps));
  router.use(require('./routes/pantry')(deps));
  router.use(require('./routes/purchases')(deps));
  router.use(require('./routes/seed')(deps));
  router.use(require('./routes/import')(deps));
  router.use(require('./routes/notifications')(deps));
  router.use(require('./routes/calendar')(deps));
  router.use(require('./routes/ai')(deps));

  return {
    name: 'mealflow',
    router,
    ensureUser,

    healthCheck() {
      try {
        db.prepare('SELECT 1').get();
        return { status: 'ok' };
      } catch (err) {
        return { status: 'error', message: err.message };
      }
    },

    shutdown() {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch (err) {
        logger.error({ err, plugin: 'mealflow' }, 'DB close error');
        try { db.close(); } catch {}
      }
    },
  };
};
