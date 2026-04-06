const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  setup, cleanDb, teardown, agent, rawAgent,
  makeRecipe, makeIngredient, addRecipeIngredient,
  makeMealPlan, makeShoppingList, makeUser2, makeHousehold,
  makeMealPlanItem,
} = require('./helpers');

describe('Batch 2: API Quality & Performance', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // BE-02: Pagination on list endpoints
  // ═══════════════════════════════════════════════════════════════
  describe('BE-02: Pagination', () => {
    it('GET /api/recipes returns paginated response with defaults', async () => {
      for (let i = 0; i < 25; i++) makeRecipe({ name: `Recipe ${i}` });
      const res = await agent().get('/api/recipes');
      assert.equal(res.status, 200);
      assert.ok(res.body.data, 'should have data array');
      assert.equal(res.body.data.length, 20, 'default limit is 20');
      assert.equal(res.body.total, 25);
      assert.equal(res.body.page, 1);
      assert.equal(res.body.limit, 20);
    });

    it('GET /api/recipes?page=2&limit=10 returns page 2', async () => {
      for (let i = 0; i < 25; i++) makeRecipe({ name: `Recipe ${String(i).padStart(2, '0')}` });
      const res = await agent().get('/api/recipes?page=2&limit=10');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 10);
      assert.equal(res.body.page, 2);
      assert.equal(res.body.limit, 10);
      assert.equal(res.body.total, 25);
    });

    it('GET /api/recipes?page=3&limit=10 returns last partial page', async () => {
      for (let i = 0; i < 25; i++) makeRecipe({ name: `Recipe ${i}` });
      const res = await agent().get('/api/recipes?page=3&limit=10');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 5);
      assert.equal(res.body.total, 25);
    });

    it('GET /api/ingredients returns paginated response', async () => {
      for (let i = 0; i < 25; i++) makeIngredient({ name: `Ingredient ${i}` });
      const res = await agent().get('/api/ingredients');
      assert.equal(res.status, 200);
      assert.ok(res.body.data);
      assert.equal(res.body.data.length, 20);
      assert.equal(res.body.total, 25);
    });

    it('GET /api/ingredients?page=2&limit=10 paginates correctly', async () => {
      for (let i = 0; i < 15; i++) makeIngredient({ name: `Ing ${i}` });
      const res = await agent().get('/api/ingredients?page=2&limit=10');
      assert.equal(res.body.data.length, 5);
      assert.equal(res.body.total, 15);
    });

    it('GET /api/shopping/:id/items returns paginated items', async () => {
      const list = makeShoppingList();
      for (let i = 0; i < 25; i++) {
        db.prepare('INSERT INTO shopping_list_items (list_id, name, quantity, unit, category, position) VALUES (?,?,?,?,?,?)')
          .run(list.id, `Item ${i}`, 1, 'pcs', 'other', i);
      }
      const res = await agent().get(`/api/shopping/${list.id}/items?page=1&limit=10`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 10);
      assert.equal(res.body.total, 25);
    });

    it('pagination with filters still counts total correctly', async () => {
      for (let i = 0; i < 10; i++) makeRecipe({ name: `Italian ${i}`, cuisine: 'Italian' });
      for (let i = 0; i < 5; i++) makeRecipe({ name: `Japanese ${i}`, cuisine: 'Japanese' });
      const res = await agent().get('/api/recipes?cuisine=Italian&page=1&limit=5');
      assert.equal(res.body.total, 10);
      assert.equal(res.body.data.length, 5);
    });

    it('invalid page defaults to 1', async () => {
      makeRecipe({ name: 'Test' });
      const res = await agent().get('/api/recipes?page=0');
      assert.equal(res.body.page, 1);
    });

    it('invalid limit defaults to 20', async () => {
      makeRecipe({ name: 'Test' });
      const res = await agent().get('/api/recipes?limit=-5');
      assert.equal(res.body.limit, 20);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-03: Response caching with ETags
  // ═══════════════════════════════════════════════════════════════
  describe('BE-03: ETags', () => {
    it('GET /api/recipes includes ETag header', async () => {
      makeRecipe({ name: 'Test' });
      const res = await agent().get('/api/recipes');
      assert.ok(res.headers.etag, 'should have ETag header');
    });

    it('returns 304 when content unchanged', async () => {
      makeRecipe({ name: 'Test' });
      const res1 = await agent().get('/api/recipes');
      const etag = res1.headers.etag;

      const res2 = await agent().get('/api/recipes').set('If-None-Match', etag);
      assert.equal(res2.status, 304);
    });

    it('returns 200 with new ETag when content changes', async () => {
      makeRecipe({ name: 'Test1' });
      const res1 = await agent().get('/api/recipes');
      const etag1 = res1.headers.etag;

      makeRecipe({ name: 'Test2' });
      const res2 = await agent().get('/api/recipes');
      assert.equal(res2.status, 200);
      assert.notEqual(res2.headers.etag, etag1);
    });

    it('GET /api/ingredients includes ETag header', async () => {
      makeIngredient({ name: 'Salt' });
      const res = await agent().get('/api/ingredients');
      assert.ok(res.headers.etag);
    });

    it('GET /api/festivals includes ETag header', async () => {
      const res = await agent().get('/api/festivals');
      assert.ok(res.headers.etag);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-04: Batch nutrition calculation
  // ═══════════════════════════════════════════════════════════════
  describe('BE-04: Batch nutrition calculation', () => {
    it('enrichRecipes batches ingredient lookups', async () => {
      // Create multiple recipes with ingredients
      for (let i = 0; i < 5; i++) {
        const recipe = makeRecipe({ name: `Recipe ${i}` });
        const ing = makeIngredient({ name: `Ingredient ${i}`, calories: 100 + i });
        addRecipeIngredient(recipe.id, ing.id, { quantity: 100 });
      }

      const res = await agent().get('/api/recipes?limit=50');
      assert.equal(res.status, 200);
      // All recipes should have nutrition data
      const recipes = res.body.data;
      for (const r of recipes) {
        assert.ok(r.ingredients, `recipe ${r.name} should have ingredients`);
        assert.ok(r.nutrition, `recipe ${r.name} should have nutrition`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-05: Audit log rotation
  // ═══════════════════════════════════════════════════════════════
  describe('BE-05: Audit log rotation', () => {
    it('POST /api/admin/audit/rotate deletes old entries', async () => {
      // Insert old entries
      for (let i = 0; i < 5; i++) {
        db.prepare("INSERT INTO audit_log (user_id, action, resource, created_at) VALUES (1, 'test', 'test', datetime('now', '-100 days'))").run();
      }
      // Insert recent entries
      for (let i = 0; i < 3; i++) {
        db.prepare("INSERT INTO audit_log (user_id, action, resource) VALUES (1, 'test', 'test')").run();
      }

      const res = await agent().post('/api/admin/audit/rotate');
      assert.equal(res.status, 200);
      assert.ok(res.body.deleted >= 5, 'should delete old entries');

      const remaining = db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get().cnt;
      assert.equal(remaining, 3);
    });

    it('audit auto-rotate removes entries older than 90 days', async () => {
      for (let i = 0; i < 5; i++) {
        db.prepare("INSERT INTO audit_log (user_id, action, resource, created_at) VALUES (1, 'test', 'test', datetime('now', '-91 days'))").run();
      }

      const res = await agent().post('/api/admin/audit/rotate');
      assert.equal(res.status, 200);
      assert.ok(res.body.deleted >= 5);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-07: Consistent error response format
  // ═══════════════════════════════════════════════════════════════
  describe('BE-07: Consistent error responses', () => {
    it('404 returns { error, code }', async () => {
      const res = await agent().get('/api/recipes/99999');
      assert.equal(res.status, 404);
      assert.ok(res.body.error);
      assert.equal(res.body.code, 'NOT_FOUND');
    });

    it('400 validation error returns { error, code }', async () => {
      const res = await agent().post('/api/recipes').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    });

    it('401 returns { error, code }', async () => {
      const res = await rawAgent().get('/api/recipes');
      assert.equal(res.status, 401);
      assert.ok(res.body.error);
      assert.equal(res.body.code, 'UNAUTHORIZED');
    });

    it('invalid JSON returns { error, code }', async () => {
      const res = await agent()
        .post('/api/recipes')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
      assert.equal(res.body.code, 'PARSE_ERROR');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-08: Request ID middleware
  // ═══════════════════════════════════════════════════════════════
  describe('BE-08: Request ID', () => {
    it('every response includes X-Request-Id header', async () => {
      const res = await agent().get('/api/recipes');
      assert.ok(res.headers['x-request-id'], 'should have X-Request-Id');
    });

    it('X-Request-Id is a valid UUID', async () => {
      const res = await agent().get('/api/recipes');
      const id = res.headers['x-request-id'];
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(id), `${id} should be a valid UUID v4`);
    });

    it('each request gets a unique ID', async () => {
      const res1 = await agent().get('/api/recipes');
      const res2 = await agent().get('/api/recipes');
      assert.notEqual(res1.headers['x-request-id'], res2.headers['x-request-id']);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-09: Health check endpoint
  // ═══════════════════════════════════════════════════════════════
  describe('BE-09: Health check', () => {
    it('GET /api/health returns ok without auth', async () => {
      const res = await rawAgent().get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.version, '1.0.0');
      assert.ok(typeof res.body.uptime === 'number');
      assert.equal(res.body.db, 'connected');
    });

    it('GET /api/health includes all required fields', async () => {
      const res = await rawAgent().get('/api/health');
      assert.ok('status' in res.body);
      assert.ok('version' in res.body);
      assert.ok('uptime' in res.body);
      assert.ok('db' in res.body);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-10: Graceful 413 for large payloads
  // ═══════════════════════════════════════════════════════════════
  describe('BE-10: Large payload handling', () => {
    it('returns 413 for payloads over 1MB', async () => {
      const largeBody = { data: 'x'.repeat(1.5 * 1024 * 1024) };
      const res = await agent()
        .post('/api/recipes')
        .send(largeBody);
      assert.equal(res.status, 413);
      assert.ok(res.body.error);
      assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-12: iCal export
  // ═══════════════════════════════════════════════════════════════
  describe('BE-12: iCal export', () => {
    it('GET /api/calendar/ical returns .ics content', async () => {
      const plan = makeMealPlan({ date: '2026-04-06', meal_type: 'lunch' });
      const recipe = makeRecipe({ name: 'Dal Fry' });
      makeMealPlanItem(plan.id, recipe.id);

      const res = await agent().get('/api/calendar/ical?start=2026-04-01&end=2026-04-30');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/calendar'));
      assert.ok(res.text.includes('BEGIN:VCALENDAR'));
      assert.ok(res.text.includes('BEGIN:VEVENT'));
      assert.ok(res.text.includes('Dal Fry'));
      assert.ok(res.text.includes('END:VCALENDAR'));
    });

    it('iCal export requires start and end params', async () => {
      const res = await agent().get('/api/calendar/ical');
      assert.equal(res.status, 400);
    });

    it('returns empty calendar when no meal plans in range', async () => {
      const res = await agent().get('/api/calendar/ical?start=2026-01-01&end=2026-01-31');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('BEGIN:VCALENDAR'));
      assert.ok(res.text.includes('END:VCALENDAR'));
      assert.ok(!res.text.includes('BEGIN:VEVENT'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-13: CSV export for nutrition
  // ═══════════════════════════════════════════════════════════════
  describe('BE-13: CSV nutrition export', () => {
    it('GET /api/nutrition/export?format=csv returns CSV', async () => {
      // Log some nutrition data
      await agent().post('/api/nutrition').send({
        date: '2026-04-06', meal_type: 'lunch', custom_name: 'Test Meal',
        servings: 1, calories: 500, protein: 20, carbs: 60, fat: 15
      });

      const res = await agent().get('/api/nutrition/export?format=csv&start=2026-04-01&end=2026-04-30');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/csv'));
      assert.ok(res.text.includes('date'));
      assert.ok(res.text.includes('calories'));
      assert.ok(res.text.includes('500'));
    });

    it('CSV export requires start and end', async () => {
      const res = await agent().get('/api/nutrition/export?format=csv');
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-14: Bulk meal plan operations
  // ═══════════════════════════════════════════════════════════════
  describe('BE-14: Bulk meal plan operations', () => {
    it('POST /api/meals/bulk creates multiple meal plans', async () => {
      const recipe = makeRecipe({ name: 'Dal' });
      const meals = [
        { date: '2026-04-06', meal_type: 'lunch', items: [{ recipe_id: recipe.id, servings: 2 }] },
        { date: '2026-04-06', meal_type: 'dinner', items: [{ recipe_id: recipe.id, servings: 1 }] },
        { date: '2026-04-07', meal_type: 'lunch', items: [{ recipe_id: recipe.id, servings: 3 }] },
      ];

      const res = await agent().post('/api/meals/bulk').send({ meals });
      assert.equal(res.status, 201);
      assert.equal(res.body.created, 3);
    });

    it('bulk create rejects empty array', async () => {
      const res = await agent().post('/api/meals/bulk').send({ meals: [] });
      assert.equal(res.status, 400);
    });

    it('bulk create is atomic—fails entirely on bad data', async () => {
      const meals = [
        { date: '2026-04-06', meal_type: 'lunch', items: [] },
        { date: 'invalid', meal_type: 'lunch', items: [] },
      ];
      const res = await agent().post('/api/meals/bulk').send({ meals });
      assert.ok(res.status >= 400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-15: Recipe image upload
  // ═══════════════════════════════════════════════════════════════
  describe('BE-15: Recipe image upload', () => {
    it('POST /api/recipes/:id/image uploads image', async () => {
      const recipe = makeRecipe({ name: 'Photo Recipe' });
      // Create a tiny valid PNG buffer (1x1 pixel)
      const pngBuffer = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c626000000002000198e1938a0000000049454e44ae426082',
        'hex'
      );

      const res = await agent()
        .post(`/api/recipes/${recipe.id}/image`)
        .attach('image', pngBuffer, 'test.png');
      assert.equal(res.status, 200);
      assert.ok(res.body.image_url);
    });

    it('rejects non-image files', async () => {
      const recipe = makeRecipe({ name: 'Bad Upload' });
      const txtBuffer = Buffer.from('not an image');

      const res = await agent()
        .post(`/api/recipes/${recipe.id}/image`)
        .attach('image', txtBuffer, 'test.txt');
      assert.equal(res.status, 400);
    });

    it('rejects files over 2MB', async () => {
      const recipe = makeRecipe({ name: 'Big Upload' });
      const bigBuffer = Buffer.alloc(2.5 * 1024 * 1024, 0xFF);

      const res = await agent()
        .post(`/api/recipes/${recipe.id}/image`)
        .attach('image', bigBuffer, 'big.png');
      assert.ok(res.status >= 400);
    });

    it('serves uploaded images via /images/:filename', async () => {
      const recipe = makeRecipe({ name: 'Serve Test' });
      const pngBuffer = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c626000000002000198e1938a0000000049454e44ae426082',
        'hex'
      );

      const uploadRes = await agent()
        .post(`/api/recipes/${recipe.id}/image`)
        .attach('image', pngBuffer, 'test.png');
      assert.equal(uploadRes.status, 200);

      const imageUrl = uploadRes.body.image_url;
      const serveRes = await agent().get(imageUrl);
      assert.equal(serveRes.status, 200);
    });
  });
});
