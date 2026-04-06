const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  setup, cleanDb, teardown, agent, rawAgent, makeUser2,
  makeRecipe, makeIngredient, makeMealPlan, makeShoppingList,
  makeHousehold, makePerson, makeTag, addRecipeIngredient,
} = require('./helpers');

describe('Batch 2: Security', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // SEC-03: API endpoint authorization audit
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-03: Endpoint authorization audit', () => {
    const endpoints = [
      { method: 'get', path: '/api/recipes' },
      { method: 'get', path: '/api/ingredients' },
      { method: 'get', path: '/api/shopping' },
      { method: 'get', path: '/api/meals' },
      { method: 'get', path: '/api/nutrition' },
      { method: 'get', path: '/api/tags' },
      { method: 'get', path: '/api/stats/dashboard' },
      { method: 'post', path: '/api/recipes' },
      { method: 'post', path: '/api/meals' },
      { method: 'post', path: '/api/shopping' },
      { method: 'get', path: '/api/calendar/today' },
      { method: 'get', path: '/api/data/export' },
    ];

    for (const { method, path } of endpoints) {
      it(`${method.toUpperCase()} ${path} → 401 without auth`, async () => {
        const res = await rawAgent()[method](path);
        assert.equal(res.status, 401, `${method.toUpperCase()} ${path} should require auth`);
      });
    }

    it('user cannot access another user\'s recipe', async () => {
      const recipe = makeRecipe({ name: 'Private Recipe', user_id: 1 });
      const user2 = makeUser2();

      const res = await user2.agent.get(`/api/recipes/${recipe.id}`);
      assert.equal(res.status, 404);
    });

    it('user cannot update another user\'s recipe', async () => {
      const recipe = makeRecipe({ name: 'Private Recipe', user_id: 1 });
      const user2 = makeUser2();

      const res = await user2.agent.put(`/api/recipes/${recipe.id}`).send({ name: 'Hacked' });
      assert.equal(res.status, 404);
    });

    it('user cannot delete another user\'s ingredient', async () => {
      const ing = makeIngredient({ name: 'Private Ingredient', user_id: 1 });
      const user2 = makeUser2();

      const res = await user2.agent.delete(`/api/ingredients/${ing.id}`);
      assert.equal(res.status, 404);
    });

    it('user cannot access another user\'s shopping list', async () => {
      const list = makeShoppingList({ user_id: 1 });
      const user2 = makeUser2();

      const res = await user2.agent.get(`/api/shopping/${list.id}`);
      assert.equal(res.status, 404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-08: Input sanitization tests
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-08: Input sanitization', () => {
    it('XSS in recipe name is stored as literal text', async () => {
      const xss = '<script>alert(1)</script>';
      const res = await agent().post('/api/recipes').send({
        name: xss, servings: 1
      });
      assert.equal(res.status, 201);
      // Should be stored literally, not executed
      const stored = db.prepare('SELECT name FROM recipes WHERE id = ?').get(res.body.id);
      assert.equal(stored.name, xss);

      // When fetched, should come back as literal text
      const getRes = await agent().get(`/api/recipes/${res.body.id}`);
      assert.equal(getRes.body.name, xss);
    });

    it('SQL injection in recipe name is harmless', async () => {
      const sqli = "'; DROP TABLE users; --";
      const res = await agent().post('/api/recipes').send({
        name: sqli, servings: 1
      });
      assert.equal(res.status, 201);

      // Verify users table still exists
      const users = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
      assert.ok(users.cnt > 0);
    });

    it('XSS in ingredient name is stored as literal text', async () => {
      const xss = '<img src=x onerror=alert(1)>';
      const res = await agent().post('/api/ingredients').send({
        name: xss, category: 'other', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, unit: 'g'
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, xss);
    });

    it('SQL injection in shopping list name is harmless', async () => {
      const sqli = "' OR '1'='1";
      const res = await agent().post('/api/shopping').send({ name: sqli });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, sqli);
    });

    it('XSS in tag name is stored as literal text', async () => {
      const xss = '<script>document.cookie</script>';
      const res = await agent().post('/api/tags').send({
        name: xss, color: '#FF0000'
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, xss);
    });

    it('Unicode and null bytes in recipe description are handled', async () => {
      const payload = 'Normal text\x00with null\u0000bytes and 🍛 emoji';
      const res = await agent().post('/api/recipes').send({
        name: 'Unicode Test', description: payload, servings: 1
      });
      assert.equal(res.status, 201);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-10: API key encryption validation
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-10: API key encryption', () => {
    it('API key is stored encrypted, not plaintext', async () => {
      const apiKey = 'sk-test-1234567890abcdef';

      await agent().put('/api/ai/config').send({
        provider: 'openai', api_key: apiKey, model: 'gpt-4',
        base_url: 'https://api.openai.com/v1', enabled: true
      });

      // Read directly from DB
      const row = db.prepare('SELECT api_key_encrypted FROM ai_config WHERE user_id = 1').get();
      assert.ok(row, 'ai_config row should exist');
      assert.notEqual(row.api_key_encrypted, apiKey, 'key should not be stored as plaintext');
      assert.ok(row.api_key_encrypted.includes(':'), 'should contain IV:tag:ciphertext format');
    });

    it('encrypted key decrypts to original value', async () => {
      const apiKey = 'sk-test-unique-key-' + crypto.randomUUID();
      const { encrypt, decrypt } = require('../src/services/ai');

      const encrypted = encrypt(apiKey);
      assert.notEqual(encrypted, apiKey);

      const decrypted = decrypt(encrypted);
      assert.equal(decrypted, apiKey);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-11: CSP tightening (checked via response headers)
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-11: CSP headers', () => {
    it('CSP blocks eval (no unsafe-eval in script-src)', async () => {
      const res = await rawAgent().get('/login');
      const csp = res.headers['content-security-policy'];
      assert.ok(csp, 'should have CSP header');
      assert.ok(!csp.includes("'unsafe-eval'"), 'should not allow unsafe-eval');
    });

    it('CSP script-src is self only', async () => {
      const res = await rawAgent().get('/login');
      const csp = res.headers['content-security-policy'];
      // script-src should only allow 'self'
      const scriptSrc = csp.match(/script-src\s+([^;]+)/);
      assert.ok(scriptSrc, 'should have script-src directive');
      assert.ok(scriptSrc[1].includes("'self'"));
      assert.ok(!scriptSrc[1].includes("'unsafe-inline'"));
    });

    it('CSP blocks object-src', async () => {
      const res = await rawAgent().get('/login');
      const csp = res.headers['content-security-policy'];
      assert.ok(csp.includes("object-src 'none'"), 'should block object-src');
    });

    it('CSP allows Google Fonts in style-src', async () => {
      const res = await rawAgent().get('/login');
      const csp = res.headers['content-security-policy'];
      assert.ok(csp.includes('fonts.googleapis.com'), 'should allow Google Fonts');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-13: Session token entropy check
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-13: Session token entropy', () => {
    it('session tokens are UUIDs (128-bit, 32 hex chars)', async () => {
      // Register a new user and check the session token
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'entropy@test.com', password: 'Str0ngPa$$!', display_name: 'Entropy Test'
      });
      assert.equal(res.status, 201);

      const cookie = res.headers['set-cookie'];
      assert.ok(cookie, 'should set cookie');
      const cookieStr = Array.isArray(cookie) ? cookie[0] : cookie;
      const match = cookieStr.match(/mf_sid=([^;]+)/);
      assert.ok(match, 'should have mf_sid cookie');

      const token = match[1];
      // UUID v4 is 36 chars with hyphens, 32 hex chars = 128 bits = 16 bytes
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(token), `token ${token} should be UUID v4 (≥16 bytes entropy)`);
    });

    it('each login produces unique session token', async () => {
      await rawAgent().post('/api/auth/register').send({
        email: 'multi@test.com', password: 'Str0ngPa$$!', display_name: 'Multi Test'
      });

      const res1 = await rawAgent().post('/api/auth/login').send({
        email: 'multi@test.com', password: 'Str0ngPa$$!'
      });
      const res2 = await rawAgent().post('/api/auth/login').send({
        email: 'multi@test.com', password: 'Str0ngPa$$!'
      });

      const extractSid = (res) => {
        const c = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'][0] : res.headers['set-cookie'];
        return c.match(/mf_sid=([^;]+)/)[1];
      };

      assert.notEqual(extractSid(res1), extractSid(res2));
    });
  });
});
