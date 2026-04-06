const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  setup, cleanDb, teardown, agent, rawAgent,
} = require('./helpers');

describe('Batch 10: Project Integrity & Final Integration', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // Migration file integrity
  // ═══════════════════════════════════════════════════════════════
  describe('Migration file integrity', () => {
    const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');

    it('all 36 migration files exist (001 through 036)', () => {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
      assert.equal(files.length, 36, `Expected 36 migration files, got ${files.length}`);

      for (let i = 1; i <= 36; i++) {
        const prefix = String(i).padStart(3, '0');
        const match = files.find(f => f.startsWith(prefix));
        assert.ok(match, `Migration ${prefix} should exist`);
      }
    });

    it('all migration files are non-empty SQL', () => {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        assert.ok(content.trim().length > 0, `${file} should not be empty`);
        // Every migration should contain at least one SQL statement keyword
        const hasSql = /CREATE|ALTER|INSERT|DROP|UPDATE|DELETE|ADD/i.test(content);
        assert.ok(hasSql, `${file} should contain valid SQL`);
      }
    });

    it('all migrations are applied in the database', () => {
      const applied = db.prepare('SELECT COUNT(*) as cnt FROM _migrations').get();
      assert.equal(applied.cnt, 36, `Expected 36 applied migrations, got ${applied.cnt}`);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Health check & version
  // ═══════════════════════════════════════════════════════════════
  describe('Health check & version', () => {
    it('GET /api/health returns version 1.0.0', async () => {
      const res = await agent().get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.version, '1.0.0');
      assert.ok(typeof res.body.uptime === 'number');
      assert.equal(res.body.db, 'connected');
    });

    it('GET /api/health/metrics returns error tracking fields', async () => {
      const res = await agent().get('/api/health/metrics');
      assert.equal(res.status, 200);
      assert.ok('error_count_1m' in res.body);
      assert.ok('error_count_5m' in res.body);
      assert.ok('uptime_s' in res.body);
      assert.ok('request_count' in res.body);
    });

    it('GET /health returns basic status for Docker healthcheck', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
    });

    it('GET /ready returns readiness status', async () => {
      const res = await rawAgent().get('/ready');
      assert.equal(res.status, 200);
      assert.ok(res.body.ready);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Seed data loading
  // ═══════════════════════════════════════════════════════════════
  describe('Seed data loading', () => {
    it('POST /api/seed/ingredients loads seed ingredients', async () => {
      const res = await agent().post('/api/seed/ingredients');
      assert.ok([200, 201].includes(res.status), `Seed ingredients should succeed, got ${res.status}`);
    });

    it('POST /api/seed/recipes loads seed recipes', async () => {
      // Seed ingredients first (recipes depend on them)
      await agent().post('/api/seed/ingredients');
      const res = await agent().post('/api/seed/recipes');
      assert.ok([200, 201].includes(res.status), `Seed recipes should succeed, got ${res.status}`);
    });

    it('seed creates recipes and ingredients', async () => {
      await agent().post('/api/seed/ingredients');
      await agent().post('/api/seed/recipes');
      const recipes = db.prepare('SELECT COUNT(*) as cnt FROM recipes WHERE user_id = 1').get();
      const ingredients = db.prepare('SELECT COUNT(*) as cnt FROM ingredients WHERE user_id = 1').get();
      assert.ok(recipes.cnt > 0, 'Should have seeded recipes');
      assert.ok(ingredients.cnt > 0, 'Should have seeded ingredients');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // OpenAPI spec validity
  // ═══════════════════════════════════════════════════════════════
  describe('OpenAPI spec validity', () => {
    it('docs/openapi.yaml exists and is valid OpenAPI 3.0.3', () => {
      const yamlPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
      assert.ok(fs.existsSync(yamlPath), 'openapi.yaml should exist');
      const content = fs.readFileSync(yamlPath, 'utf-8');
      assert.ok(content.includes('openapi: 3.0.3'));
      assert.ok(content.includes('info:'));
      assert.ok(content.includes('paths:'));
    });

    it('GET /api/docs serves the OpenAPI spec', async () => {
      const res = await agent().get('/api/docs');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('openapi: 3.0.3'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-10: Payload limit handling
  // ═══════════════════════════════════════════════════════════════
  describe('BE-10: Payload limit', () => {
    it('accepts normal-sized JSON payloads', async () => {
      const res = await agent().post('/api/recipes').send({
        name: 'Normal Recipe',
        servings: 2,
      });
      assert.ok([200, 201].includes(res.status));
    });

    it('rejects payloads exceeding 1MB limit', async () => {
      const largePayload = { name: 'x'.repeat(1024 * 1024 + 1) };
      const res = await agent()
        .post('/api/recipes')
        .send(largePayload);
      // Express returns 413 for payload too large
      assert.ok([413, 400].includes(res.status), `Expected 413 or 400, got ${res.status}`);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DO-06: Request logger fields
  // ═══════════════════════════════════════════════════════════════
  describe('DO-06: Request logger', () => {
    it('request-logger.js exports a function', () => {
      const createLogger = require('../src/middleware/request-logger');
      assert.equal(typeof createLogger, 'function');
    });

    it('request logger middleware logs all required fields', () => {
      const createLogger = require('../src/middleware/request-logger');
      const loggedData = [];
      const mockLogger = {
        info: (data, msg) => loggedData.push({ data, msg }),
      };
      const middleware = createLogger(mockLogger);
      // Simulate a request/response cycle
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        userId: 42,
        requestId: 'abc-123',
        ip: '127.0.0.1',
      };
      const listeners = {};
      const mockRes = {
        statusCode: 200,
        on: (event, cb) => { listeners[event] = cb; },
      };
      middleware(mockReq, mockRes, () => {});
      // Trigger 'finish' event
      listeners['finish']();

      assert.equal(loggedData.length, 1);
      const { data } = loggedData[0];
      assert.equal(data.method, 'GET');
      assert.equal(data.path, '/api/test');
      assert.equal(data.status, 200);
      assert.ok(typeof data.durationMs === 'number');
      assert.equal(data.userId, 42);
      assert.equal(data.requestId, 'abc-123');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DO-10: Graceful shutdown
  // ═══════════════════════════════════════════════════════════════
  describe('DO-10: Graceful shutdown', () => {
    it('server.js exports app and db', () => {
      const server = require('../src/server');
      assert.ok(server.app, 'should export app');
      assert.ok(server.db, 'should export db');
    });

    it('server.js has SIGTERM and SIGINT handlers defined', () => {
      const serverSrc = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'server.js'),
        'utf-8'
      );
      assert.ok(serverSrc.includes("process.on('SIGTERM'"), 'should handle SIGTERM');
      assert.ok(serverSrc.includes("process.on('SIGINT'"), 'should handle SIGINT');
      assert.ok(serverSrc.includes('db.close()'), 'should close DB on shutdown');
    });

    it('config has shutdown timeout', () => {
      const config = require('../src/config');
      assert.ok(typeof config.shutdownTimeoutMs === 'number');
      assert.ok(config.shutdownTimeoutMs > 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Database integrity
  // ═══════════════════════════════════════════════════════════════
  describe('Database integrity', () => {
    it('all expected tables exist', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'recipes_fts%'"
      ).all().map(t => t.name);

      const expectedCore = [
        'users', 'sessions', 'login_attempts',
        'ingredients', 'recipes', 'recipe_ingredients',
        'tags', 'recipe_tags',
        'meal_plans', 'meal_plan_items',
        'shopping_lists', 'shopping_list_items',
        'nutrition_log', 'nutrition_goals',
        'settings', 'audit_log', '_migrations',
      ];

      const expectedMigrated = [
        'households', 'persons', 'person_assignments',
        'invite_codes', 'festivals', 'fasting_rules',
        'person_festivals', 'festival_recipes',
        'polls', 'poll_options', 'poll_votes',
        'meal_templates', 'meal_template_items',
        'pantry', 'purchase_history',
        'nutrition_alerts', 'recurrence_rules',
        'notifications', 'notification_preferences',
        'ai_config', 'meal_ratings', 'recipe_versions',
        'meal_slot_overrides',
      ];

      for (const t of [...expectedCore, ...expectedMigrated]) {
        assert.ok(tables.includes(t), `Table '${t}' should exist`);
      }
    });

    it('foreign keys are enabled', () => {
      const fk = db.pragma('foreign_keys');
      assert.deepStrictEqual(fk, [{ foreign_keys: 1 }]);
    });

    it('WAL mode is active', () => {
      const mode = db.pragma('journal_mode');
      assert.deepStrictEqual(mode, [{ journal_mode: 'wal' }]);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Package.json version
  // ═══════════════════════════════════════════════════════════════
  describe('Package.json version', () => {
    it('package.json version is 1.0.0', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
      );
      assert.equal(pkg.version, '1.0.0');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Route modules load without error
  // ═══════════════════════════════════════════════════════════════
  describe('Route modules integrity', () => {
    const routeFiles = [
      'auth', 'recipes', 'ingredients', 'meals', 'tags',
      'nutrition', 'shopping', 'stats', 'data',
      'households', 'persons', 'festivals', 'polls',
      'templates', 'pantry', 'purchases', 'seed',
      'import', 'notifications', 'calendar', 'ai',
      'cost', 'ratings', 'units',
    ];

    for (const name of routeFiles) {
      it(`src/routes/${name}.js exports a function`, () => {
        const routeModule = require(`../src/routes/${name}`);
        assert.equal(typeof routeModule, 'function', `${name} should export a factory function`);
      });
    }
  });
});
