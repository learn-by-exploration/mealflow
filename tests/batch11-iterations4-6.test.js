const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  setup, cleanDb, teardown, agent, rawAgent, makeUser2, makeHousehold,
} = require('./helpers');

describe('Iterations 4-6: Cookies, Auth UX & Security Hardening', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // ITERATION 4: Cookie & Session Issues
  // ═══════════════════════════════════════════════════════════════

  describe('Issue 10: SameSite=Lax on mf_sid', () => {
    it('register sets mf_sid with SameSite=Lax', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'samesite-reg@test.com',
        password: 'Password1',
        display_name: 'SS Reg',
      });
      assert.equal(res.status, 201);
      const cookies = res.headers['set-cookie'];
      const sidCookie = (Array.isArray(cookies) ? cookies : [cookies]).find(c => c.startsWith('mf_sid='));
      assert.ok(sidCookie, 'mf_sid cookie should be set');
      assert.ok(sidCookie.includes('SameSite=Lax'), `Expected SameSite=Lax, got: ${sidCookie}`);
      assert.ok(!sidCookie.includes('SameSite=Strict'), 'Should not be SameSite=Strict');
    });

    it('login sets mf_sid with SameSite=Lax', async () => {
      // First register
      await rawAgent().post('/api/auth/register').send({
        email: 'samesite-login@test.com',
        password: 'Password1',
      });
      // Then login
      const res = await rawAgent().post('/api/auth/login').send({
        email: 'samesite-login@test.com',
        password: 'Password1',
      });
      assert.equal(res.status, 200);
      const cookies = res.headers['set-cookie'];
      const sidCookie = (Array.isArray(cookies) ? cookies : [cookies]).find(c => c.startsWith('mf_sid='));
      assert.ok(sidCookie, 'mf_sid cookie should be set');
      assert.ok(sidCookie.includes('SameSite=Lax'), `Expected SameSite=Lax, got: ${sidCookie}`);
    });
  });

  describe('Issue 11: Sliding session extension', () => {
    it('extends session when past half-life', async () => {
      // Create a session that expires in 2 days (less than half of 7)
      const sid = 'sliding-test-' + crypto.randomUUID();
      db.prepare("INSERT INTO sessions (sid, user_id, expires_at) VALUES (?, 1, datetime('now', '+2 days'))").run(sid);

      const { app } = setup();
      const request = require('supertest');

      // Make an authenticated request
      const res = await request(app)
        .get('/api/auth/session')
        .set('Cookie', `mf_sid=${sid}`);
      assert.equal(res.status, 200);

      // Check that expires_at was extended
      const session = db.prepare('SELECT expires_at FROM sessions WHERE sid = ?').get(sid);
      const expiresAt = new Date(session.expires_at + 'Z');
      const now = new Date();
      const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);
      // Should be extended to ~7 days from now (the maxAgeDays)
      assert.ok(daysUntilExpiry > 5, `Session should be extended, but expires in ${daysUntilExpiry.toFixed(1)} days`);
    });

    it('does not extend session when not past half-life', async () => {
      // Create a session that expires in 6 days (more than half of 7)
      const sid = 'no-extend-test-' + crypto.randomUUID();
      db.prepare("INSERT INTO sessions (sid, user_id, expires_at) VALUES (?, 1, datetime('now', '+6 days'))").run(sid);

      const originalSession = db.prepare('SELECT expires_at FROM sessions WHERE sid = ?').get(sid);

      const { app } = setup();
      const request = require('supertest');

      await request(app)
        .get('/api/auth/session')
        .set('Cookie', `mf_sid=${sid}`);

      const updatedSession = db.prepare('SELECT expires_at FROM sessions WHERE sid = ?').get(sid);
      assert.equal(updatedSession.expires_at, originalSession.expires_at, 'Session should not be extended');
    });
  });

  describe('Issue 15: Logout clears csrf_token cookie', () => {
    it('logout response clears both mf_sid and csrf_token cookies', async () => {
      // Register first to get a valid session
      const regRes = await rawAgent().post('/api/auth/register').send({
        email: 'logout-csrf@test.com',
        password: 'Password1',
      });
      const cookies = regRes.headers['set-cookie'];
      const sidCookie = (Array.isArray(cookies) ? cookies : [cookies]).find(c => c.startsWith('mf_sid='));
      const sid = sidCookie.split(';')[0].split('=')[1];

      const res = await rawAgent()
        .post('/api/auth/logout')
        .set('Cookie', `mf_sid=${sid}; csrf_token=abc123`);
      assert.equal(res.status, 200);

      const setCookies = res.headers['set-cookie'];
      assert.ok(Array.isArray(setCookies), 'Should set multiple cookies');
      const clearedSid = setCookies.find(c => c.startsWith('mf_sid=;') || c.match(/^mf_sid=;/));
      const clearedCsrf = setCookies.find(c => c.startsWith('csrf_token=;') || c.match(/^csrf_token=;/));
      assert.ok(clearedSid, 'Should clear mf_sid cookie');
      assert.ok(clearedCsrf, 'Should clear csrf_token cookie');
      assert.ok(clearedCsrf.includes('Max-Age=0'), 'csrf_token should have Max-Age=0');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ITERATION 5: Auth UX
  // ═══════════════════════════════════════════════════════════════

  describe('Issue 13: Login button disable during submit', () => {
    it('login.js contains submit button disable logic', () => {
      const loginJs = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'login.js'), 'utf-8'
      );
      assert.ok(loginJs.includes('disabled'), 'Should disable submit button');
      assert.ok(loginJs.includes('finally'), 'Should re-enable in finally block');
    });
  });

  describe('Issue 14: Login page redirect for authenticated users', () => {
    it('login.js checks session on load', () => {
      const loginJs = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'login.js'), 'utf-8'
      );
      assert.ok(loginJs.includes('/api/auth/session'), 'Should check session endpoint');
    });
  });

  describe('Issue 16: Seed endpoints require admin role', () => {
    it('non-admin cannot POST /api/seed/ingredients', async () => {
      // Create a household and assign user1 as member (not admin)
      const hh = makeHousehold({ name: 'Seed Test Family' });
      db.prepare('UPDATE users SET household_role = ? WHERE id = 1').run('member');

      const res = await agent().post('/api/seed/ingredients');
      assert.equal(res.status, 403, 'Non-admin should get 403');
    });

    it('admin can POST /api/seed/ingredients', async () => {
      const hh = makeHousehold({ name: 'Seed Admin Family' });
      db.prepare('UPDATE users SET household_role = ? WHERE id = 1').run('admin');

      const res = await agent().post('/api/seed/ingredients');
      assert.equal(res.status, 200, 'Admin should be able to seed');
    });

    it('non-admin cannot POST /api/seed/recipes', async () => {
      const hh = makeHousehold({ name: 'Seed Test Family 2' });
      db.prepare('UPDATE users SET household_role = ? WHERE id = 1').run('member');

      const res = await agent().post('/api/seed/recipes');
      assert.equal(res.status, 403);
    });

    it('non-admin cannot POST /api/seed/festivals', async () => {
      const hh = makeHousehold({ name: 'Seed Test Family 3' });
      db.prepare('UPDATE users SET household_role = ? WHERE id = 1').run('member');

      const res = await agent().post('/api/seed/festivals');
      assert.equal(res.status, 403);
    });

    it('non-admin cannot POST /api/seed/sample-plan', async () => {
      const hh = makeHousehold({ name: 'Seed Test Family 4' });
      db.prepare('UPDATE users SET household_role = ? WHERE id = 1').run('member');

      const res = await agent().post('/api/seed/sample-plan');
      assert.equal(res.status, 403);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ITERATION 6: Security Hardening
  // ═══════════════════════════════════════════════════════════════

  describe('Issue 17: No stale .db-shm cleanup', () => {
    it('db/index.js does not unlinkSync shm files', () => {
      const dbIndex = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'db', 'index.js'), 'utf-8'
      );
      assert.ok(!dbIndex.includes('unlinkSync'), 'Should not contain unlinkSync for SHM cleanup');
    });
  });

  describe('Issue 19: Static assets have cache headers', () => {
    it('server.js uses maxAge on express.static', () => {
      const serverJs = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'server.js'), 'utf-8'
      );
      assert.ok(serverJs.includes('maxAge'), 'express.static should have maxAge option');
    });

    it('static assets return Cache-Control header', async () => {
      const res = await rawAgent().get('/login.html');
      if (res.status === 200) {
        const cc = res.headers['cache-control'];
        assert.ok(cc, 'Should have Cache-Control header');
        assert.ok(cc.includes('max-age'), `Cache-Control should include max-age, got: ${cc}`);
      }
    });
  });

  describe('Issue 23: docker-compose.yml no hardcoded IP', () => {
    it('docker-compose.yml does not contain 192.168', () => {
      const dc = fs.readFileSync(
        path.join(__dirname, '..', 'docker-compose.yml'), 'utf-8'
      );
      assert.ok(!dc.includes('192.168'), 'Should not hardcode private IP');
    });
  });

  describe('Docker log rotation', () => {
    it('docker-compose.yml has logging config', () => {
      const dc = fs.readFileSync(
        path.join(__dirname, '..', 'docker-compose.yml'), 'utf-8'
      );
      assert.ok(dc.includes('logging'), 'Should have logging config');
      assert.ok(dc.includes('max-size'), 'Should have max-size for log rotation');
      assert.ok(dc.includes('max-file'), 'Should have max-file for log rotation');
    });
  });
});
