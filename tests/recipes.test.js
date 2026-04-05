const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeRecipe, makeIngredient, makeTag, linkTag, addRecipeIngredient } = require('./helpers');

describe('Recipes', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('GET /api/recipes — returns empty list', async () => {
    const res = await agent().get('/api/recipes');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('POST /api/recipes — creates recipe', async () => {
    const res = await agent().post('/api/recipes').send({
      name: 'Pasta Carbonara', servings: 4, prep_time: 10, cook_time: 20, cuisine: 'Italian'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Pasta Carbonara');
    assert.equal(res.body.servings, 4);
  });

  it('GET /api/recipes/:id — returns recipe with ingredients and tags', async () => {
    const recipe = makeRecipe({ name: 'Test' });
    const ing = makeIngredient({ name: 'Egg' });
    addRecipeIngredient(recipe.id, ing.id, { quantity: 200 });
    const tag = makeTag({ name: 'Quick' });
    linkTag(recipe.id, tag.id);

    const res = await agent().get(`/api/recipes/${recipe.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Test');
    assert.equal(res.body.ingredients.length, 1);
    assert.equal(res.body.tags.length, 1);
    assert.ok(res.body.nutrition);
  });

  it('PUT /api/recipes/:id — updates recipe', async () => {
    const recipe = makeRecipe();
    const res = await agent().put(`/api/recipes/${recipe.id}`).send({ name: 'Updated' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Updated');
  });

  it('DELETE /api/recipes/:id — deletes recipe', async () => {
    const recipe = makeRecipe();
    const res = await agent().delete(`/api/recipes/${recipe.id}`);
    assert.equal(res.status, 200);

    const check = await agent().get(`/api/recipes/${recipe.id}`);
    assert.equal(check.status, 404);
  });

  it('PATCH /api/recipes/:id/favorite — toggles favorite', async () => {
    const recipe = makeRecipe();
    const res = await agent().patch(`/api/recipes/${recipe.id}/favorite`);
    assert.equal(res.status, 200);
    assert.equal(res.body.is_favorite, 1);

    const res2 = await agent().patch(`/api/recipes/${recipe.id}/favorite`);
    assert.equal(res2.body.is_favorite, 0);
  });

  it('GET /api/recipes?q= — filters by search', async () => {
    makeRecipe({ name: 'Pasta' });
    makeRecipe({ name: 'Salad' });
    const res = await agent().get('/api/recipes?q=pasta');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Pasta');
  });

  it('GET /api/recipes?cuisine= — filters by cuisine', async () => {
    makeRecipe({ name: 'Sushi', cuisine: 'Japanese' });
    makeRecipe({ name: 'Pasta', cuisine: 'Italian' });
    const res = await agent().get('/api/recipes?cuisine=Japanese');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
  });

  it('POST /api/recipes — rejects missing name', async () => {
    const res = await agent().post('/api/recipes').send({ servings: 2 });
    assert.equal(res.status, 400);
  });
});
