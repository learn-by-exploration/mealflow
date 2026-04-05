const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Search (FTS)', () => {
  before(() => setup());
  beforeEach(async () => {
    cleanDb();
    // Seed data for search tests
    await agent().post('/api/seed/ingredients');
    await agent().post('/api/seed/recipes');
  });
  after(() => teardown());

  it('GET /api/recipes/search?q=dal — finds recipes by name', async () => {
    const res = await agent().get('/api/recipes/search?q=dal');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1, 'should find at least one dal recipe');
    const names = res.body.map(r => r.name.toLowerCase());
    assert.ok(names.some(n => n.includes('dal')), 'should include a dal recipe');
  });

  it('GET /api/recipes/search?q=lentil — finds by description', async () => {
    const res = await agent().get('/api/recipes/search?q=lentil');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1, 'should find recipes with lentil in description');
  });

  it('GET /api/recipes/search?region=south_indian — filters by region', async () => {
    const res = await agent().get('/api/recipes/search?region=south_indian');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1, 'should find south indian recipes');
    for (const r of res.body) {
      assert.equal(r.region, 'south_indian');
    }
  });

  it('GET /api/recipes/search — returns all when no query', async () => {
    const res = await agent().get('/api/recipes/search');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 10, 'should return all seeded recipes');
  });

  it('GET /api/recipes/search?q=nonexistent — returns empty array', async () => {
    const res = await agent().get('/api/recipes/search?q=nonexistent');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('GET /api/recipes/search?q=dal&region=pan_indian — combined filters', async () => {
    const res = await agent().get('/api/recipes/search?q=dal&region=pan_indian');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1);
    for (const r of res.body) {
      assert.equal(r.region, 'pan_indian');
    }
  });

  it('GET /api/recipes/search?q=special!chars — handles special characters', async () => {
    const res = await agent().get('/api/recipes/search?q=special!chars');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('GET /api/recipes/search?difficulty=easy — filters by difficulty', async () => {
    const res = await agent().get('/api/recipes/search?difficulty=easy');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1, 'should find easy recipes');
    for (const r of res.body) {
      assert.equal(r.difficulty, 'easy');
    }
  });
});
