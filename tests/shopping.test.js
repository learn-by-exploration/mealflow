const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeShoppingList, makeIngredient, makeRecipe, makeMealPlan, addRecipeIngredient } = require('./helpers');

describe('Shopping Lists', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('GET /api/shopping — returns empty list', async () => {
    const res = await agent().get('/api/shopping');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('POST /api/shopping — creates list', async () => {
    const res = await agent().post('/api/shopping').send({ name: 'Weekly Groceries' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Weekly Groceries');
  });

  it('POST /api/shopping/:id/items — adds item', async () => {
    const list = makeShoppingList();
    const res = await agent().post(`/api/shopping/${list.id}/items`).send({ name: 'Milk', quantity: 1, unit: 'liter' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Milk');
  });

  it('PATCH /api/shopping/:id/items/:itemId/toggle — toggles checked', async () => {
    const list = makeShoppingList();
    const { db } = setup();
    const r = db.prepare('INSERT INTO shopping_list_items (list_id, name, quantity, unit, position) VALUES (?,?,?,?,?)').run(list.id, 'Eggs', 12, 'pcs', 0);
    
    const res = await agent().patch(`/api/shopping/${list.id}/items/${r.lastInsertRowid}/toggle`);
    assert.equal(res.status, 200);
    assert.equal(res.body.checked, true);
  });

  it('POST /api/shopping/generate — generates from meal plans', async () => {
    const ing = makeIngredient({ name: 'Tomato', category: 'vegetable' });
    const recipe = makeRecipe();
    addRecipeIngredient(recipe.id, ing.id, { quantity: 200, unit: 'g' });
    const plan = makeMealPlan({ date: '2026-04-05' });
    const { db } = setup();
    db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(plan.id, recipe.id, 1, 0);

    const res = await agent().post('/api/shopping/generate').send({
      date_from: '2026-04-05', date_to: '2026-04-05'
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.items.length > 0);
  });

  it('DELETE /api/shopping/:id — deletes list', async () => {
    const list = makeShoppingList();
    const res = await agent().delete(`/api/shopping/${list.id}`);
    assert.equal(res.status, 200);
  });
});
