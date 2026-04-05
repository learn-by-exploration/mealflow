const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeRecipe, makeIngredient, addRecipeIngredient } = require('./helpers');

describe('Scaling', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  function createRecipeWithIngredients(servings = 2) {
    const recipe = makeRecipe({ name: 'Scalable Recipe', servings, cuisine: 'indian', region: 'pan_indian' });
    const ing1 = makeIngredient({ name: 'Ing A' });
    const ing2 = makeIngredient({ name: 'Ing B' });
    addRecipeIngredient(recipe.id, ing1.id, { quantity: 100, unit: 'g' });
    addRecipeIngredient(recipe.id, ing2.id, { quantity: 50, unit: 'ml' });
    return recipe;
  }

  it('GET /api/recipes/:id/scaled/4 — scales up (2→4 servings, quantities double)', async () => {
    const recipe = createRecipeWithIngredients(2);
    const res = await agent().get(`/api/recipes/${recipe.id}/scaled/4`);
    assert.equal(res.status, 200);
    assert.equal(res.body.servings, 4);
    assert.equal(res.body.ingredients[0].quantity, 200);
    assert.equal(res.body.ingredients[1].quantity, 100);
  });

  it('GET /api/recipes/:id/scaled/1 — scales down', async () => {
    const recipe = createRecipeWithIngredients(2);
    const res = await agent().get(`/api/recipes/${recipe.id}/scaled/1`);
    assert.equal(res.status, 200);
    assert.equal(res.body.servings, 1);
    assert.equal(res.body.ingredients[0].quantity, 50);
    assert.equal(res.body.ingredients[1].quantity, 25);
  });

  it('GET /api/recipes/:id/scaled/2 — same servings, no change', async () => {
    const recipe = createRecipeWithIngredients(2);
    const res = await agent().get(`/api/recipes/${recipe.id}/scaled/2`);
    assert.equal(res.status, 200);
    assert.equal(res.body.servings, 2);
    assert.equal(res.body.ingredients[0].quantity, 100);
    assert.equal(res.body.ingredients[1].quantity, 50);
  });

  it('GET /api/recipes/:id/scaled/0.5 — fractional servings', async () => {
    const recipe = createRecipeWithIngredients(2);
    const res = await agent().get(`/api/recipes/${recipe.id}/scaled/0.5`);
    assert.equal(res.status, 200);
    assert.equal(res.body.servings, 0.5);
    assert.equal(res.body.ingredients[0].quantity, 25);
    assert.equal(res.body.ingredients[1].quantity, 12.5);
  });

  it('GET /api/recipes/999/scaled/4 — returns 404 for non-existent recipe', async () => {
    const res = await agent().get('/api/recipes/999/scaled/4');
    assert.equal(res.status, 404);
  });
});
