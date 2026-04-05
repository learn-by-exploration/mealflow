const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Seed', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('POST /api/seed/ingredients — loads ingredients from JSON', async () => {
    const res = await agent().post('/api/seed/ingredients');
    assert.equal(res.status, 200);
    assert.ok(res.body.count > 0, 'should insert ingredients');
  });

  it('POST /api/seed/recipes — loads recipes with ingredients linked', async () => {
    // Seed ingredients first so recipe ingredients can be linked
    await agent().post('/api/seed/ingredients');
    const res = await agent().post('/api/seed/recipes');
    assert.equal(res.status, 200);
    assert.ok(res.body.count > 0, 'should insert recipes');

    // Verify ingredients are linked
    const { db } = setup();
    const recipe = db.prepare("SELECT * FROM recipes WHERE name = 'Dal Tadka'").get();
    assert.ok(recipe, 'Dal Tadka should exist');
    const ings = db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ?').all(recipe.id);
    assert.ok(ings.length > 0, 'recipe should have linked ingredients');
  });

  it('POST /api/seed/ingredients — idempotent (re-seeding does not duplicate)', async () => {
    await agent().post('/api/seed/ingredients');
    const first = await agent().post('/api/seed/ingredients');
    const { db } = setup();
    const count = db.prepare("SELECT COUNT(*) AS c FROM ingredients WHERE is_system = 1").get().c;
    assert.equal(count, first.body.count, 'count should not increase on re-seed');
  });

  it('Seeded ingredients have nutrition data', async () => {
    await agent().post('/api/seed/ingredients');
    const { db } = setup();
    const ing = db.prepare("SELECT * FROM ingredients WHERE name = 'Toor Dal' AND is_system = 1").get();
    assert.ok(ing, 'Toor Dal should exist');
    assert.ok(ing.calories > 0, 'should have calories');
    assert.ok(ing.protein > 0, 'should have protein');
  });

  it('Seeded recipes have region assigned', async () => {
    await agent().post('/api/seed/ingredients');
    await agent().post('/api/seed/recipes');
    const { db } = setup();
    const recipe = db.prepare("SELECT * FROM recipes WHERE name = 'Sambar'").get();
    assert.ok(recipe, 'Sambar should exist');
    assert.equal(recipe.region, 'south_indian');
  });

  it('Seeded recipes have is_system=1', async () => {
    await agent().post('/api/seed/ingredients');
    await agent().post('/api/seed/recipes');
    const { db } = setup();
    const recipe = db.prepare("SELECT * FROM recipes WHERE name = 'Butter Chicken'").get();
    assert.ok(recipe, 'Butter Chicken should exist');
    assert.equal(recipe.is_system, 1);
  });
});
