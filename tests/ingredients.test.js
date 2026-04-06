const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeIngredient } = require('./helpers');

describe('Ingredients', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('GET /api/ingredients — returns empty list', async () => {
    const res = await agent().get('/api/ingredients');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.total, 0);
  });

  it('POST /api/ingredients — creates ingredient', async () => {
    const res = await agent().post('/api/ingredients').send({
      name: 'Chicken Breast', category: 'protein', calories: 165, protein: 31, carbs: 0, fat: 3.6
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Chicken Breast');
    assert.equal(res.body.calories, 165);
  });

  it('PUT /api/ingredients/:id — updates ingredient', async () => {
    const ing = makeIngredient();
    const res = await agent().put(`/api/ingredients/${ing.id}`).send({ calories: 200 });
    assert.equal(res.status, 200);
    assert.equal(res.body.calories, 200);
  });

  it('DELETE /api/ingredients/:id — deletes ingredient', async () => {
    const ing = makeIngredient();
    const res = await agent().delete(`/api/ingredients/${ing.id}`);
    assert.equal(res.status, 200);
  });

  it('GET /api/ingredients?category= — filters', async () => {
    makeIngredient({ name: 'Egg', category: 'protein' });
    makeIngredient({ name: 'Rice', category: 'grain' });
    const res = await agent().get('/api/ingredients?category=protein');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
  });

  it('POST /api/ingredients/bulk — bulk creates', async () => {
    const res = await agent().post('/api/ingredients/bulk').send({
      ingredients: [
        { name: 'Salt', category: 'spice' },
        { name: 'Pepper', category: 'spice' },
      ]
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.created, 2);
  });
});
