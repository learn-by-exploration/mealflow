const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeRecipe, makeIngredient, addRecipeIngredient, makeMealPlan } = require('./helpers');

describe('Cost', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('POST /api/cost/meal/:id — calculates meal cost from ingredient prices', async () => {
    const { db } = setup();
    const recipe = makeRecipe({ name: 'Paneer Butter Masala' });
    const ing1 = makeIngredient({ name: 'Paneer', unit: 'g' });
    const ing2 = makeIngredient({ name: 'Butter', unit: 'g' });
    addRecipeIngredient(recipe.id, ing1.id, { quantity: 200, unit: 'g' });
    addRecipeIngredient(recipe.id, ing2.id, { quantity: 50, unit: 'g' });

    // Set prices on ingredients
    db.prepare('UPDATE ingredients SET price_per_unit = ?, price_currency = ? WHERE id = ?').run(0.5, 'INR', ing1.id);
    db.prepare('UPDATE ingredients SET price_per_unit = ?, price_currency = ? WHERE id = ?').run(1.2, 'INR', ing2.id);

    // Create a meal plan with this recipe
    const plan = makeMealPlan({ date: '2026-04-06', meal_type: 'dinner' });
    db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings) VALUES (?,?,?)').run(plan.id, recipe.id, 1);

    const res = await agent().post(`/api/cost/meal/${plan.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.currency, 'INR');
    assert.ok(typeof res.body.total_cost === 'number');
    assert.ok(res.body.total_cost > 0);
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.items.length, 2);
  });

  it('POST /api/cost/meal/:id — returns 0 when no prices set', async () => {
    const { db } = setup();
    const recipe = makeRecipe({ name: 'Simple Rice' });
    const ing = makeIngredient({ name: 'Rice' });
    addRecipeIngredient(recipe.id, ing.id, { quantity: 300 });

    const plan = makeMealPlan({ date: '2026-04-06', meal_type: 'lunch' });
    db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings) VALUES (?,?,?)').run(plan.id, recipe.id, 1);

    const res = await agent().post(`/api/cost/meal/${plan.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.total_cost, 0);
    assert.equal(res.body.currency, 'INR');
  });

  it('GET /api/cost/daily/:date — returns daily cost', async () => {
    const { db } = setup();
    const recipe = makeRecipe({ name: 'Dosa' });
    const ing = makeIngredient({ name: 'Urad Dal' });
    addRecipeIngredient(recipe.id, ing.id, { quantity: 100 });
    db.prepare('UPDATE ingredients SET price_per_unit = ? WHERE id = ?').run(0.3, ing.id);

    const plan = makeMealPlan({ date: '2026-04-06', meal_type: 'breakfast' });
    db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings) VALUES (?,?,?)').run(plan.id, recipe.id, 1);

    const res = await agent().get('/api/cost/daily/2026-04-06');
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.total_cost === 'number');
    assert.equal(res.body.date, '2026-04-06');
    assert.equal(res.body.currency, 'INR');
  });

  it('GET /api/cost/weekly/:startDate — returns weekly summary', async () => {
    const { db } = setup();
    const recipe = makeRecipe({ name: 'Idli' });
    const ing = makeIngredient({ name: 'Rice Batter' });
    addRecipeIngredient(recipe.id, ing.id, { quantity: 150 });
    db.prepare('UPDATE ingredients SET price_per_unit = ? WHERE id = ?').run(0.2, ing.id);

    const plan = makeMealPlan({ date: '2026-04-06', meal_type: 'breakfast' });
    db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings) VALUES (?,?,?)').run(plan.id, recipe.id, 1);

    const res = await agent().get('/api/cost/weekly/2026-04-06');
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.total_cost === 'number');
    assert.equal(res.body.currency, 'INR');
    assert.ok(Array.isArray(res.body.days));
    assert.equal(res.body.days.length, 7);
  });
});
