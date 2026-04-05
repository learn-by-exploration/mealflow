const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHousehold, makeRecipe, makeMealPlan, makeUser2 } = require('./helpers');

describe('Meal Templates', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  function setupWithMeals() {
    const h = makeHousehold();
    const recipe = makeRecipe();
    const p1 = makeMealPlan({ date: '2026-04-06', meal_type: 'breakfast' });
    const p2 = makeMealPlan({ date: '2026-04-06', meal_type: 'dinner' });
    const p3 = makeMealPlan({ date: '2026-04-07', meal_type: 'lunch' });
    const { db } = setup();
    db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(p1.id, recipe.id, 1, 0);
    db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(p2.id, recipe.id, 2, 0);
    db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(p3.id, recipe.id, 1, 0);
    return { household: h, recipe };
  }

  it('POST /api/templates — saves week as template', async () => {
    setupWithMeals();
    const res = await agent().post('/api/templates').send({
      name: 'My Week',
      start_date: '2026-04-06',
      end_date: '2026-04-07',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'My Week');
    assert.ok(res.body.items.length >= 3);
  });

  it('GET /api/templates — lists templates', async () => {
    const { household } = setupWithMeals();
    const { db } = setup();
    db.prepare('INSERT INTO meal_templates (household_id, name, duration_days) VALUES (?,?,?)').run(household.id, 'Week A', 7);

    const res = await agent().get('/api/templates');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
  });

  it('GET /api/templates/:id — template detail with items', async () => {
    setupWithMeals();
    const createRes = await agent().post('/api/templates').send({
      name: 'Detail Test',
      start_date: '2026-04-06',
      end_date: '2026-04-07',
    });
    const res = await agent().get(`/api/templates/${createRes.body.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Detail Test');
    assert.ok(res.body.items.length >= 3);
  });

  it('POST /api/templates/:id/apply — applies template to new dates', async () => {
    setupWithMeals();
    const createRes = await agent().post('/api/templates').send({
      name: 'Apply Test',
      start_date: '2026-04-06',
      end_date: '2026-04-07',
    });

    const res = await agent().post(`/api/templates/${createRes.body.id}/apply`).send({
      start_date: '2026-04-20',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.plans_created >= 1);
  });

  it('Applied template creates correct meal plans and items', async () => {
    setupWithMeals();
    const createRes = await agent().post('/api/templates').send({
      name: 'Verify Apply',
      start_date: '2026-04-06',
      end_date: '2026-04-07',
    });

    await agent().post(`/api/templates/${createRes.body.id}/apply`).send({
      start_date: '2026-04-20',
    });

    // Check that meals exist on the new dates
    const d1 = await agent().get('/api/meals/2026-04-20');
    assert.equal(d1.status, 200);
    assert.ok(d1.body.meals.length >= 1);

    const d2 = await agent().get('/api/meals/2026-04-21');
    assert.equal(d2.status, 200);
    assert.ok(d2.body.meals.length >= 1);
  });

  it('DELETE /api/templates/:id — deletes template', async () => {
    const { household } = setupWithMeals();
    const { db } = setup();
    const r = db.prepare('INSERT INTO meal_templates (household_id, name, duration_days) VALUES (?,?,?)').run(household.id, 'To Delete', 7);

    const res = await agent().delete(`/api/templates/${r.lastInsertRowid}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
  });

  it('Template scoped to household', async () => {
    const { household } = setupWithMeals();
    const { db } = setup();
    db.prepare('INSERT INTO meal_templates (household_id, name, duration_days) VALUES (?,?,?)').run(household.id, 'Scoped', 7);

    const user2 = makeUser2();
    const h2 = makeHousehold({ name: 'Other Family', created_by: user2.userId });
    const res = await user2.agent.get('/api/templates');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0);
  });

  it('Template duration validation (end_date >= start_date)', async () => {
    setupWithMeals();
    const res = await agent().post('/api/templates').send({
      name: 'Bad Template',
      start_date: '2026-04-10',
      end_date: '2026-04-05',
    });
    assert.equal(res.status, 400);
  });
});
