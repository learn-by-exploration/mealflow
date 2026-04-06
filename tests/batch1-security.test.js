const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  setup, cleanDb, teardown, agent, rawAgent,
  makeRecipe, makeIngredient, makeMealPlan, makeShoppingList,
  makeHousehold, makeUser2, makePerson,
} = require('./helpers');

describe('Batch 1: Security & DB Improvements', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => {
    cleanDb();
    // Reset test user password to known value each test
    const hash = bcrypt.hashSync('testpassword', 4);
    db.prepare('UPDATE users SET password_hash=? WHERE id=1').run(hash);
  });

  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // SEC-01: Household-scoped data access
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-01: Household-scoped data access', () => {
    it('user cannot find recipes from another household via search', async () => {
      // User 1 in household A with a recipe
      makeHousehold({ created_by: 1 });
      makeRecipe({ name: 'Butter Chicken', user_id: 1 });

      // User 2 in household B
      const user2 = makeUser2();
      makeHousehold({ name: 'Other Family', created_by: user2.userId });

      const res = await user2.agent.get('/api/recipes/search?q=Butter');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 0);
    });

    it('user cannot clone recipe from another household', async () => {
      makeHousehold({ created_by: 1 });
      const recipe = makeRecipe({ name: 'Secret Recipe', user_id: 1 });

      const user2 = makeUser2();
      makeHousehold({ name: 'Other Family', created_by: user2.userId });

      const res = await user2.agent.post(`/api/recipes/${recipe.id}/clone`);
      assert.equal(res.status, 404);
    });

    it('user cannot scale recipe from another household', async () => {
      makeHousehold({ created_by: 1 });
      const recipe = makeRecipe({ name: 'Secret Recipe', user_id: 1 });

      const user2 = makeUser2();
      makeHousehold({ name: 'Other Family', created_by: user2.userId });

      const res = await user2.agent.get(`/api/recipes/${recipe.id}/scaled/4`);
      assert.equal(res.status, 404);
    });

    it('user cannot access persons from another household', async () => {
      const hh1 = makeHousehold({ created_by: 1 });
      makePerson(hh1.id, { name: 'Family Member A' });

      const user2 = makeUser2();
      const hh2 = makeHousehold({ name: 'Other Family', created_by: user2.userId });

      const res = await user2.agent.get('/api/persons');
      assert.equal(res.status, 200);
      const names = res.body.map(p => p.name);
      assert.ok(!names.includes('Family Member A'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-02: Household role model
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-02: Household role model', () => {
    it('household_role column exists on users table', () => {
      const cols = db.prepare("PRAGMA table_info(users)").all();
      const roleCol = cols.find(c => c.name === 'household_role');
      assert.ok(roleCol, 'household_role column should exist');
      assert.equal(roleCol.dflt_value, "'member'");
    });

    it('creating a household sets role to admin', async () => {
      const res = await agent().post('/api/households').send({ name: 'My Family' });
      assert.equal(res.status, 201);

      const user = db.prepare('SELECT household_role FROM users WHERE id = 1').get();
      assert.equal(user.household_role, 'admin');
    });

    it('joining a household sets role to member', async () => {
      const hh = makeHousehold({ created_by: 1 });
      // Set user 1 as admin
      db.prepare('UPDATE users SET household_role = ? WHERE id = 1').run('admin');

      const code = crypto.randomBytes(16).toString('hex');
      db.prepare("INSERT INTO invite_codes (code, household_id, created_by, expires_at) VALUES (?,?,?,datetime('now','+7 days'))").run(code, hh.id, 1);

      const user2 = makeUser2();
      const res = await user2.agent.post('/api/households/join').send({ code });
      assert.equal(res.status, 200);

      const u2 = db.prepare('SELECT household_role FROM users WHERE id = ?').get(user2.userId);
      assert.equal(u2.household_role, 'member');
    });

    it('admin can delete household', async () => {
      makeHousehold({ created_by: 1 });
      db.prepare('UPDATE users SET household_role = ? WHERE id = 1').run('admin');

      const res = await agent().delete('/api/households/current');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    it('member cannot delete household', async () => {
      const hh = makeHousehold({ created_by: 1 });
      // User 2 joins as member
      const user2 = makeUser2();
      db.prepare('UPDATE users SET household_id = ?, household_role = ? WHERE id = ?').run(hh.id, 'member', user2.userId);

      const res = await user2.agent.delete('/api/households/current');
      assert.equal(res.status, 403);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-04: Per-user rate limiting
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-04: Per-user rate limiting', () => {
    function callMiddleware(mw, req) {
      let nextCalled = false;
      let statusCode = null;
      let body = null;
      const res = {
        status(c) { statusCode = c; return this; },
        json(b) { body = b; },
      };
      mw(req, res, () => { nextCalled = true; });
      return { nextCalled, statusCode, body };
    }

    it('allows requests under the limit', () => {
      const createPerUserRateLimit = require('../src/middleware/per-user-rate-limit');
      const limiter = createPerUserRateLimit({ maxRequests: 5, windowMs: 60000 });

      for (let i = 0; i < 5; i++) {
        const { nextCalled } = callMiddleware(limiter, { userId: 99 });
        assert.ok(nextCalled, `Request ${i + 1} should pass`);
      }
    });

    it('blocks requests over the limit with 429', () => {
      const createPerUserRateLimit = require('../src/middleware/per-user-rate-limit');
      const limiter = createPerUserRateLimit({ maxRequests: 3, windowMs: 60000 });

      for (let i = 0; i < 3; i++) {
        callMiddleware(limiter, { userId: 88 });
      }

      const { nextCalled, statusCode } = callMiddleware(limiter, { userId: 88 });
      assert.equal(nextCalled, false);
      assert.equal(statusCode, 429);
    });

    it('tracks limits per user independently', () => {
      const createPerUserRateLimit = require('../src/middleware/per-user-rate-limit');
      const limiter = createPerUserRateLimit({ maxRequests: 2, windowMs: 60000 });

      // User A: exhaust limit
      callMiddleware(limiter, { userId: 77 });
      callMiddleware(limiter, { userId: 77 });
      const { statusCode } = callMiddleware(limiter, { userId: 77 });
      assert.equal(statusCode, 429, 'User A should be rate limited');

      // User B: should still work
      const { nextCalled } = callMiddleware(limiter, { userId: 78 });
      assert.ok(nextCalled, 'User B should not be limited');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-05: Password strength validation
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-05: Password strength validation', () => {
    it('rejects password without uppercase letter', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'weak1@test.com', password: 'abcdefg1',
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.toLowerCase().includes('uppercase'));
    });

    it('rejects password without number', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'weak2@test.com', password: 'Abcdefgh',
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.toLowerCase().includes('number'));
    });

    it('rejects password shorter than 8 characters', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'weak3@test.com', password: 'Ab1',
      });
      assert.equal(res.status, 400);
    });

    it('accepts valid strong password', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'strong@test.com', password: 'StrongPass1',
      });
      assert.equal(res.status, 201);
    });

    it('validates strength on change-password too', async () => {
      const res = await agent().post('/api/auth/change-password').send({
        current_password: 'testpassword',
        new_password: 'weakpass',
      });
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-06: Session invalidation on password change
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-06: Session invalidation on password change', () => {
    it('invalidates other sessions on password change', async () => {
      // Create two sessions for user 1
      const sid1 = 'sess-a-' + crypto.randomUUID();
      const sid2 = 'sess-b-' + crypto.randomUUID();
      db.prepare("INSERT INTO sessions (sid, user_id, expires_at) VALUES (?,?,datetime('now','+1 day'))").run(sid1, 1);
      db.prepare("INSERT INTO sessions (sid, user_id, expires_at) VALUES (?,?,datetime('now','+1 day'))").run(sid2, 1);

      // Change password using sid1
      const changeRes = await rawAgent()
        .post('/api/auth/change-password')
        .set('Cookie', `mf_sid=${sid1}`)
        .send({ current_password: 'testpassword', new_password: 'NewPass123' });
      assert.equal(changeRes.status, 200);

      // sid2 should be invalidated
      const check2 = await rawAgent().get('/api/auth/session').set('Cookie', `mf_sid=${sid2}`);
      assert.equal(check2.status, 401);

      // sid1 should still work
      const check1 = await rawAgent().get('/api/auth/session').set('Cookie', `mf_sid=${sid1}`);
      assert.equal(check1.status, 200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-07: Account deletion with data wipe
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-07: Account deletion', () => {
    it('DELETE /api/auth/account — deletes user with password confirmation', async () => {
      // Create a new user via API for deletion
      const regRes = await rawAgent().post('/api/auth/register').send({
        email: 'delete-me@test.com', password: 'DeleteMe1', display_name: 'Doomed',
      });
      assert.equal(regRes.status, 201);
      const cookie = regRes.headers['set-cookie'][0];

      const res = await rawAgent()
        .delete('/api/auth/account')
        .set('Cookie', cookie)
        .send({ password: 'DeleteMe1' });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);

      // User should no longer exist
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get('delete-me@test.com');
      assert.equal(user, undefined);
    });

    it('DELETE /api/auth/account — rejects without password', async () => {
      const res = await agent().delete('/api/auth/account').send({});
      assert.equal(res.status, 403);
    });

    it('DELETE /api/auth/account — rejects wrong password', async () => {
      const res = await agent().delete('/api/auth/account').send({ password: 'wrongpassword' });
      assert.equal(res.status, 403);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-09: Cookie security flags
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-09: Cookie security flags', () => {
    it('login cookie has HttpOnly, SameSite=Lax, and Path=/', async () => {
      const res = await rawAgent().post('/api/auth/login').send({
        email: 'test@test.com', password: 'testpassword',
      });
      assert.equal(res.status, 200);
      const cookie = res.headers['set-cookie'][0];
      assert.ok(cookie.includes('HttpOnly'), 'Should have HttpOnly');
      assert.ok(cookie.includes('SameSite=Lax'), 'Should have SameSite=Lax');
      assert.ok(cookie.includes('Path=/'), 'Should have Path=/');
      // In test env (not https), Secure flag should NOT be present
      assert.ok(!cookie.includes('Secure'), 'Should not have Secure in non-https test');
    });

    it('register cookie has proper security flags', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'cookie-test@test.com', password: 'CookieTest1',
      });
      assert.equal(res.status, 201);
      const cookie = res.headers['set-cookie'][0];
      assert.ok(cookie.includes('HttpOnly'));
      assert.ok(cookie.includes('SameSite=Lax'));
      assert.ok(cookie.includes('Path=/'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-01: Database indexes
  // ═══════════════════════════════════════════════════════════════
  describe('BE-01: Database indexes', () => {
    it('required indexes exist', () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
      const names = indexes.map(i => i.name);

      assert.ok(names.includes('idx_meals_date'), 'idx_meals_date should exist');
      assert.ok(names.includes('idx_meals_user'), 'idx_meals_user should exist');
      assert.ok(names.includes('idx_recipes_user'), 'idx_recipes_user should exist');
      assert.ok(names.includes('idx_ingredients_user'), 'idx_ingredients_user should exist');
      assert.ok(names.includes('idx_pantry_expiry'), 'idx_pantry_expiry should exist');
      assert.ok(names.includes('idx_audit_user'), 'idx_audit_user should exist');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-01: updated_at columns and triggers
  // ═══════════════════════════════════════════════════════════════
  describe('DE-01: updated_at columns', () => {
    it('updated_at columns exist on required tables', () => {
      for (const table of ['recipes', 'ingredients', 'meal_plans', 'shopping_lists', 'persons']) {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all();
        const col = cols.find(c => c.name === 'updated_at');
        assert.ok(col, `${table} should have updated_at column`);
      }
    });

    it('trigger auto-updates updated_at on recipe change', async () => {
      makeHousehold({ created_by: 1 });
      const recipe = makeRecipe({ name: 'Original', user_id: 1 });
      const originalUpdatedAt = recipe.updated_at;

      // Wait a moment to ensure timestamp differs
      await new Promise(r => setTimeout(r, 1100));

      db.prepare('UPDATE recipes SET name = ? WHERE id = ?').run('Updated', recipe.id);
      const updated = db.prepare('SELECT updated_at FROM recipes WHERE id = ?').get(recipe.id);

      assert.notEqual(updated.updated_at, originalUpdatedAt, 'updated_at should change on update');
    });

    it('trigger auto-updates updated_at on ingredient change', async () => {
      const ing = makeIngredient({ name: 'Test Flour', user_id: 1 });
      const original = ing.updated_at;

      await new Promise(r => setTimeout(r, 1100));

      db.prepare('UPDATE ingredients SET name = ? WHERE id = ?').run('Changed Flour', ing.id);
      const updated = db.prepare('SELECT updated_at FROM ingredients WHERE id = ?').get(ing.id);

      assert.notEqual(updated.updated_at, original, 'updated_at should change on update');
    });
  });
});
