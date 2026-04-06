const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const {
  setup, cleanDb, teardown, agent, rawAgent,
} = require('./helpers');

describe('Batch 3: DevOps & Monitoring', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // DO-06: Structured request logging
  // ═══════════════════════════════════════════════════════════════
  describe('DO-06: Request logger fields', () => {
    it('request-logger middleware is a function', () => {
      const createRequestLogger = require('../src/middleware/request-logger');
      const logger = { info: () => {} };
      const mw = createRequestLogger(logger);
      assert.equal(typeof mw, 'function');
    });

    it('logs request_id field', async () => {
      const logged = [];
      const createRequestLogger = require('../src/middleware/request-logger');
      const fakeLogger = { info: (obj) => logged.push(obj) };
      const mw = createRequestLogger(fakeLogger);

      // Simulate req/res
      const req = {
        method: 'GET',
        path: '/api/recipes',
        ip: '127.0.0.1',
        userId: 1,
        requestId: 'test-req-id-123',
      };
      const res = {
        statusCode: 200,
        on: (event, cb) => { if (event === 'finish') cb(); },
      };
      mw(req, res, () => {});

      assert.ok(logged.length > 0, 'should have logged');
      assert.equal(logged[0].requestId, 'test-req-id-123');
      assert.equal(logged[0].method, 'GET');
      assert.equal(logged[0].status, 200);
      assert.ok('durationMs' in logged[0], 'should have durationMs');
      assert.ok('userId' in logged[0], 'should have userId');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DO-07: Error rate tracking + metrics endpoint
  // ═══════════════════════════════════════════════════════════════
  describe('DO-07: Error rate tracking', () => {
    it('GET /api/health/metrics returns error counts', async () => {
      const res = await rawAgent().get('/api/health/metrics');
      assert.equal(res.status, 200);
      assert.ok('error_count_1m' in res.body, 'should have error_count_1m');
      assert.ok('error_count_5m' in res.body, 'should have error_count_5m');
      assert.ok('uptime_s' in res.body, 'should have uptime_s');
      assert.ok('request_count' in res.body, 'should have request_count');
    });

    it('GET /api/health/metrics requires no auth', async () => {
      const res = await rawAgent().get('/api/health/metrics');
      assert.equal(res.status, 200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DO-08: Database size monitoring
  // ═══════════════════════════════════════════════════════════════
  describe('DO-08: Database size in health', () => {
    it('GET /api/health includes db_size_mb', async () => {
      const res = await rawAgent().get('/api/health');
      assert.equal(res.status, 200);
      assert.ok('db_size_mb' in res.body, 'should have db_size_mb');
      assert.equal(typeof res.body.db_size_mb, 'number');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DO-09: Startup readiness probe
  // ═══════════════════════════════════════════════════════════════
  describe('DO-09: Readiness probe', () => {
    it('GET /api/health returns 200 when ready', async () => {
      const res = await rawAgent().get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
    });

    it('GET /ready returns ready: true when DB is healthy', async () => {
      const res = await rawAgent().get('/ready');
      assert.equal(res.status, 200);
      assert.equal(res.body.ready, true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DO-10: Graceful shutdown
  // ═══════════════════════════════════════════════════════════════
  describe('DO-10: Graceful shutdown', () => {
    it('server exports app and db for testability', () => {
      const server = require('../src/server');
      assert.ok(server.app, 'should export app');
      assert.ok(server.db, 'should export db');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DO-12: Environment validation on startup
  // ═══════════════════════════════════════════════════════════════
  describe('DO-12: Environment validation', () => {
    it('validateEnv function exists and returns validated config', () => {
      const validateEnv = require('../src/validate-env');
      assert.equal(typeof validateEnv, 'function');
      // Should not throw with valid defaults
      const result = validateEnv({
        PORT: '3458',
        NODE_ENV: 'test',
        DB_DIR: './data',
      });
      assert.ok(result, 'should return a result');
      assert.equal(result.PORT, 3458);
      assert.equal(result.NODE_ENV, 'test');
    });

    it('validateEnv rejects invalid PORT', () => {
      const validateEnv = require('../src/validate-env');
      assert.throws(() => {
        validateEnv({ PORT: 'not-a-number', NODE_ENV: 'test', DB_DIR: './data' });
      }, /PORT/i);
    });

    it('validateEnv rejects invalid NODE_ENV', () => {
      const validateEnv = require('../src/validate-env');
      assert.throws(() => {
        validateEnv({ PORT: '3458', NODE_ENV: 'invalid', DB_DIR: './data' });
      }, /NODE_ENV/i);
    });

    it('validateEnv accepts all valid NODE_ENV values', () => {
      const validateEnv = require('../src/validate-env');
      for (const env of ['development', 'production', 'test']) {
        const result = validateEnv({ PORT: '3458', NODE_ENV: env, DB_DIR: './data' });
        assert.equal(result.NODE_ENV, env);
      }
    });
  });
});
