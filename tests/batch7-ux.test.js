const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Batch 7 — UX & Frontend Support', () => {
  before(setup);
  beforeEach(cleanDb);
  after(teardown);

  // PO-13: Recipe of the Day
  describe('GET /api/recipes/suggestion/daily', () => {
    it('returns null when no recipes exist', async () => {
      const res = await agent()
        .get('/api/recipes/suggestion/daily')
        .expect(200);

      assert.equal(res.body, null);
    });

    it('returns a recipe when recipes exist', async () => {
      // Create a recipe first
      await agent()
        .post('/api/recipes')
        .send({ name: 'Dal Tadka', servings: 2, cuisine: 'Indian' })
        .expect(201);

      const res = await agent()
        .get('/api/recipes/suggestion/daily')
        .expect(200);

      assert.ok(res.body);
      assert.ok(res.body.name);
    });

    it('returns deterministic result for same day', async () => {
      await agent().post('/api/recipes').send({ name: 'Recipe A', servings: 2 }).expect(201);
      await agent().post('/api/recipes').send({ name: 'Recipe B', servings: 2 }).expect(201);

      const r1 = await agent().get('/api/recipes/suggestion/daily').expect(200);
      const r2 = await agent().get('/api/recipes/suggestion/daily').expect(200);

      assert.equal(r1.body.name, r2.body.name);
    });
  });

  // DE-07: Nutrition trend data (via existing /api/stats/nutrition)
  describe('GET /api/stats/nutrition', () => {
    it('returns array for last 7 days by default', async () => {
      const res = await agent()
        .get('/api/stats/nutrition')
        .expect(200);

      assert.ok(Array.isArray(res.body));
    });

    it('accepts custom days parameter', async () => {
      const res = await agent()
        .get('/api/stats/nutrition?days=14')
        .expect(200);

      assert.ok(Array.isArray(res.body));
    });
  });
});
