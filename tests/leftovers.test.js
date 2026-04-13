const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeRecipe, makeIngredient, addRecipeIngredient, makeMealPlan } = require('./helpers');

describe('Leftovers', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  function createMealPlanItem(planId, recipeId, servings = 1) {
    const { db } = setup();
    const r = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(planId, recipeId, servings, 0);
    return db.prepare('SELECT * FROM meal_plan_items WHERE id = ?').get(r.lastInsertRowid);
  }

  it('PUT /api/meals/items/:id/leftover — marks item as leftover', async () => {
    const plan = makeMealPlan();
    const recipe = makeRecipe();
    const item = createMealPlanItem(plan.id, recipe.id);

    const res = await agent().put(`/api/meals/items/${item.id}/leftover`);
    assert.equal(res.status, 200);
    assert.equal(res.body.is_leftover, 1);
  });

  it('PUT /api/meals/items/:id/leftover — toggles off', async () => {
    const plan = makeMealPlan();
    const recipe = makeRecipe();
    const item = createMealPlanItem(plan.id, recipe.id);

    await agent().put(`/api/meals/items/${item.id}/leftover`);
    const res = await agent().put(`/api/meals/items/${item.id}/leftover`);
    assert.equal(res.status, 200);
    assert.equal(res.body.is_leftover, 0);
  });

  it('GET /api/meals/leftovers — lists recent leftovers', async () => {
    const plan = makeMealPlan({ date: yesterday });
    const recipe = makeRecipe({ name: 'Leftover Dal' });
    const item = createMealPlanItem(plan.id, recipe.id);

    const { db } = setup();
    db.prepare('UPDATE meal_plan_items SET is_leftover = 1 WHERE id = ?').run(item.id);

    const res = await agent().get('/api/meals/leftovers');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1);
    assert.equal(res.body[0].recipe_name, 'Leftover Dal');
  });

  it('POST /api/meals/items/:id/reuse — reuses leftover in new slot', async () => {
    const plan = makeMealPlan({ date: yesterday });
    const recipe = makeRecipe();
    const item = createMealPlanItem(plan.id, recipe.id);

    const { db } = setup();
    db.prepare('UPDATE meal_plan_items SET is_leftover = 1 WHERE id = ?').run(item.id);

    // Create target meal plan
    const targetPlan = makeMealPlan({ date: '2026-04-05', meal_type: 'dinner' });

    const res = await agent().post(`/api/meals/items/${item.id}/reuse`).send({
      meal_plan_id: targetPlan.id,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.leftover_from_item_id, item.id);
  });

  it('Reused item has leftover_from_item_id set', async () => {
    const plan = makeMealPlan({ date: yesterday });
    const recipe = makeRecipe();
    const item = createMealPlanItem(plan.id, recipe.id);

    const { db } = setup();
    db.prepare('UPDATE meal_plan_items SET is_leftover = 1 WHERE id = ?').run(item.id);

    const targetPlan = makeMealPlan({ date: '2026-04-05', meal_type: 'dinner' });
    await agent().post(`/api/meals/items/${item.id}/reuse`).send({ meal_plan_id: targetPlan.id });

    const reusedItems = db.prepare('SELECT * FROM meal_plan_items WHERE leftover_from_item_id = ?').all(item.id);
    assert.equal(reusedItems.length, 1);
    assert.equal(reusedItems[0].leftover_from_item_id, item.id);
  });

  it('Shopping list generation excludes leftover items', async () => {
    const ing = makeIngredient({ name: 'Rice', category: 'grain' });
    const recipe = makeRecipe();
    addRecipeIngredient(recipe.id, ing.id, { quantity: 200, unit: 'g' });
    const plan = makeMealPlan({ date: '2026-04-05' });

    const { db } = setup();
    const r = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position, is_leftover) VALUES (?,?,?,?,?)').run(plan.id, recipe.id, 1, 0, 1);

    const res = await agent().post('/api/shopping/generate').send({
      date_from: '2026-04-05', date_to: '2026-04-05'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.items.length, 0);
  });
});
