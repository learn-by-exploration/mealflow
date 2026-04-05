const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeRecipe, makeMealPlan, makeHousehold, makePerson, assignPersonToItem } = require('./helpers');

describe('Meals', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('POST /api/meals — creates meal plan slot', async () => {
    const res = await agent().post('/api/meals').send({ date: '2026-04-05', meal_type: 'lunch' });
    assert.equal(res.status, 201);
    assert.equal(res.body.meal_type, 'lunch');
  });

  it('POST /api/meals/:id/items — adds item', async () => {
    const plan = makeMealPlan();
    const recipe = makeRecipe();
    const res = await agent().post(`/api/meals/${plan.id}/items`).send({ recipe_id: recipe.id, servings: 2 });
    assert.equal(res.status, 201);
    assert.equal(res.body.recipe_id, recipe.id);
  });

  it('GET /api/meals/:date — returns day plan with nutrition', async () => {
    const plan = makeMealPlan({ date: '2026-04-05', meal_type: 'breakfast' });
    const recipe = makeRecipe();
    const { db } = setup();
    db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(plan.id, recipe.id, 1, 0);

    const res = await agent().get('/api/meals/2026-04-05');
    assert.equal(res.status, 200);
    assert.equal(res.body.date, '2026-04-05');
    assert.ok(res.body.meals);
    assert.ok(res.body.nutrition);
  });

  it('DELETE /api/meals/:id — deletes meal plan', async () => {
    const plan = makeMealPlan();
    const res = await agent().delete(`/api/meals/${plan.id}`);
    assert.equal(res.status, 200);
  });

  it('DELETE /api/meals/:id/items/:itemId — removes item', async () => {
    const plan = makeMealPlan();
    const recipe = makeRecipe();
    const { db } = setup();
    const r = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(plan.id, recipe.id, 1, 0);
    
    const res = await agent().delete(`/api/meals/${plan.id}/items/${r.lastInsertRowid}`);
    assert.equal(res.status, 200);
  });

  it('POST /api/meals — creates with morning_snack type', async () => {
    const res = await agent().post('/api/meals').send({ date: '2026-04-06', meal_type: 'morning_snack' });
    assert.equal(res.status, 201);
    assert.equal(res.body.meal_type, 'morning_snack');
  });

  it('POST /api/meals — creates with evening_snack type', async () => {
    const res = await agent().post('/api/meals').send({ date: '2026-04-06', meal_type: 'evening_snack' });
    assert.equal(res.status, 201);
    assert.equal(res.body.meal_type, 'evening_snack');
  });

  it('GET /api/meals/:date — returns person assignments in items', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'Test Eater' });
    const plan = makeMealPlan({ date: '2026-04-07', meal_type: 'lunch' });
    const recipe = makeRecipe();
    const { db } = setup();
    const r = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(plan.id, recipe.id, 1, 0);
    assignPersonToItem(r.lastInsertRowid, person.id);

    const res = await agent().get('/api/meals/2026-04-07');
    assert.equal(res.status, 200);
    const item = res.body.meals[0].items[0];
    assert.ok(item.assignments);
    assert.equal(item.assignments.length, 1);
    assert.equal(item.assignments[0].person_id, person.id);
  });

  it('POST /api/meals/:id/copy — copies person assignments with the items', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'Copy Person' });
    const plan = makeMealPlan({ date: '2026-04-08', meal_type: 'lunch' });
    const recipe = makeRecipe();
    const { db } = setup();
    const r = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(plan.id, recipe.id, 1, 0);
    assignPersonToItem(r.lastInsertRowid, person.id);

    const res = await agent().post(`/api/meals/${plan.id}/copy`).send({ target_date: '2026-04-09' });
    assert.equal(res.status, 201);

    // Verify assignments were copied
    const targetItems = db.prepare('SELECT * FROM meal_plan_items WHERE meal_plan_id = ?').all(res.body.id);
    assert.ok(targetItems.length > 0);
    const copiedAssignments = db.prepare('SELECT * FROM person_assignments WHERE meal_plan_item_id = ?').all(targetItems[0].id);
    assert.equal(copiedAssignments.length, 1);
    assert.equal(copiedAssignments[0].person_id, person.id);
  });
});
