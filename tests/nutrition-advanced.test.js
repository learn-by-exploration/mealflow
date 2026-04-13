const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  setup, cleanDb, teardown, agent,
  makeHousehold, makePerson, makeRecipe, makeIngredient,
  addRecipeIngredient, makeMealPlan, makeMealPlanItem, assignPersonToItem
} = require('./helpers');

describe('Nutrition Advanced (Per-Person)', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Helper: full setup chain for per-person nutrition
  function setupPersonWithMeal(opts = {}) {
    const { db } = setup();
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, {
      name: 'Alice',
      calorie_target: 2000,
      protein_target: 50,
      carbs_target: 250,
      fat_target: 65,
      ...opts.personOverrides
    });

    // Create an ingredient with micronutrients
    const ing = makeIngredient({
      name: 'Spinach',
      calories: 23,
      protein: 2.9,
      carbs: 3.6,
      fat: 0.4,
    });
    // Add micronutrients directly
    db.prepare('UPDATE ingredients SET iron = ?, calcium = ? WHERE id = ?').run(2.7, 99, ing.id);

    const recipe = makeRecipe({ name: 'Spinach Salad', servings: 2 });
    addRecipeIngredient(recipe.id, ing.id, { quantity: 200, unit: 'g' });

    const plan = makeMealPlan({ date: opts.date || '2026-04-05', meal_type: 'lunch' });
    const item = makeMealPlanItem(plan.id, recipe.id, { servings: 2 });
    const assignment = assignPersonToItem(item.id, person.id, { servings: 1 });

    return { hh, person, ing, recipe, plan, item, assignment, db };
  }

  it('GET /api/nutrition/person/:id/daily/:date — returns per-person nutrition', async () => {
    const { person } = setupPersonWithMeal();
    const res = await agent().get(`/api/nutrition/person/${person.id}/daily/2026-04-05`);
    assert.equal(res.status, 200);
    assert.ok(res.body.totals);
    assert.ok('calories' in res.body.totals);
    assert.ok('protein' in res.body.totals);
    assert.ok('iron' in res.body.totals);
    assert.ok('calcium' in res.body.totals);
    assert.equal(res.body.person_id, person.id);
    assert.equal(res.body.date, '2026-04-05');
  });

  it('Per-person nutrition is zero when no assignments', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'Bob' });
    const res = await agent().get(`/api/nutrition/person/${person.id}/daily/2026-04-05`);
    assert.equal(res.status, 200);
    assert.equal(res.body.totals.calories, 0);
    assert.equal(res.body.totals.protein, 0);
    assert.equal(res.body.totals.iron, 0);
    assert.equal(res.body.totals.calcium, 0);
  });

  it('Per-person nutrition sums correctly from recipe ingredients', async () => {
    const { person } = setupPersonWithMeal();
    const res = await agent().get(`/api/nutrition/person/${person.id}/daily/2026-04-05`);
    assert.equal(res.status, 200);

    // Recipe: 200g spinach (23 cal/100g) = 46 cal total for full recipe (2 servings)
    // Person assigned 1 serving out of 2 → factor = 1/2
    // Expected: 46 * 0.5 = 23
    assert.equal(res.body.totals.calories, 23);
    // protein: 200/100 * 2.9 * 0.5 = 2.9
    assert.equal(res.body.totals.protein, 2.9);
    // iron: 200/100 * 2.7 * 0.5 = 2.7
    assert.equal(res.body.totals.iron, 2.7);
    // calcium: 200/100 * 99 * 0.5 = 99
    assert.equal(res.body.totals.calcium, 99);
  });

  it('GET /api/nutrition/person/:id/weekly/:startDate — returns 7-day breakdown', async () => {
    const { person } = setupPersonWithMeal({ date: '2026-04-05' });
    // Add another meal on a different day for the same person
    const { db } = setup();
    const ing2 = makeIngredient({ name: 'Lentils', calories: 116, protein: 9, carbs: 20, fat: 0.4 });
    db.prepare('UPDATE ingredients SET iron = ?, calcium = ? WHERE id = ?').run(3.3, 19, ing2.id);
    const recipe2 = makeRecipe({ name: 'Lentil Soup', servings: 2 });
    addRecipeIngredient(recipe2.id, ing2.id, { quantity: 150, unit: 'g' });
    const plan2 = makeMealPlan({ date: '2026-04-06', meal_type: 'dinner' });
    const item2 = makeMealPlanItem(plan2.id, recipe2.id);
    assignPersonToItem(item2.id, person.id, { servings: 1 });

    const res = await agent().get(`/api/nutrition/person/${person.id}/weekly/2026-04-05`);
    assert.equal(res.status, 200);
    assert.ok(res.body.daily);
    assert.equal(res.body.daily.length, 7);
    assert.ok(res.body.averages);
  });

  it('Weekly summary includes daily values and averages', async () => {
    const { person } = setupPersonWithMeal({ date: '2026-04-05' });
    const res = await agent().get(`/api/nutrition/person/${person.id}/weekly/2026-04-05`);
    assert.equal(res.status, 200);

    // First day should have data, rest should be zeros
    const day1 = res.body.daily.find(d => d.date === '2026-04-05');
    assert.ok(day1);
    assert.ok(day1.totals.calories > 0);

    // Averages should be totals / 7
    assert.ok('calories' in res.body.averages);
    assert.equal(res.body.averages.calories, Math.round(day1.totals.calories / 7 * 10) / 10);
  });

  it('GET /api/nutrition/household/daily/:date — returns all persons\' nutrition', async () => {
    const { db } = setup();
    const hh = makeHousehold({ created_by: 1 });
    const person1 = makePerson(hh.id, { name: 'Alice' });
    const person2 = makePerson(hh.id, { name: 'Bob' });

    const res = await agent().get(`/api/nutrition/household/daily/2026-04-05`);
    assert.equal(res.status, 200);
    assert.ok(res.body.persons);
    assert.equal(res.body.date, '2026-04-05');
  });

  it('Household daily shows each person separately', async () => {
    const { db } = setup();
    const hh = makeHousehold({ created_by: 1 });
    const person1 = makePerson(hh.id, { name: 'Alice' });
    const person2 = makePerson(hh.id, { name: 'Bob' });

    // Set up a meal only for Alice
    const ing = makeIngredient({ name: 'Rice', calories: 130, protein: 2.7, carbs: 28, fat: 0.3 });
    db.prepare('UPDATE ingredients SET iron = ?, calcium = ? WHERE id = ?').run(0.2, 10, ing.id);
    const recipe = makeRecipe({ name: 'Rice Bowl', servings: 1 });
    addRecipeIngredient(recipe.id, ing.id, { quantity: 100, unit: 'g' });
    const plan = makeMealPlan({ date: '2026-04-05', meal_type: 'lunch' });
    const item = makeMealPlanItem(plan.id, recipe.id);
    assignPersonToItem(item.id, person1.id, { servings: 1 });

    const res = await agent().get(`/api/nutrition/household/daily/2026-04-05`);
    assert.equal(res.status, 200);
    assert.equal(res.body.persons.length, 2);

    const alice = res.body.persons.find(p => p.person_id === person1.id);
    const bob = res.body.persons.find(p => p.person_id === person2.id);
    assert.ok(alice);
    assert.ok(bob);
    assert.ok(alice.totals.calories > 0);
    assert.equal(bob.totals.calories, 0);
  });

  it('POST /api/nutrition/alerts/generate — generates low alerts', async () => {
    const { db, person } = setupPersonWithMeal({ date: yesterday });

    // Set high targets so intake is <70%
    db.prepare('UPDATE persons SET calorie_target = ?, protein_target = ? WHERE id = ?').run(10000, 500, person.id);

    const res = await agent().post('/api/nutrition/alerts/generate');
    assert.equal(res.status, 200);
    assert.ok(res.body.alerts);
    const lowAlerts = res.body.alerts.filter(a => a.alert_type === 'low');
    assert.ok(lowAlerts.length > 0);
  });

  it('POST /api/nutrition/alerts/generate — generates high alerts', async () => {
    const { db, person } = setupPersonWithMeal({ date: yesterday });

    // Set very low targets so intake is >150%
    db.prepare('UPDATE persons SET calorie_target = ?, protein_target = ? WHERE id = ?').run(1, 0.1, person.id);

    const res = await agent().post('/api/nutrition/alerts/generate');
    assert.equal(res.status, 200);
    assert.ok(res.body.alerts);
    const highAlerts = res.body.alerts.filter(a => a.alert_type === 'high');
    assert.ok(highAlerts.length > 0);
  });

  it('Alert generation is idempotent (doesn\'t duplicate for same date)', async () => {
    const { db, person } = setupPersonWithMeal({ date: yesterday });
    db.prepare('UPDATE persons SET calorie_target = ? WHERE id = ?').run(10000, person.id);

    await agent().post('/api/nutrition/alerts/generate');
    const res2 = await agent().post('/api/nutrition/alerts/generate');
    assert.equal(res2.status, 200);

    // Count alerts in DB — should not have duplicates
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM nutrition_alerts WHERE person_id = ?').get(person.id);
    const firstRun = res2.body.alerts.length;
    // Run again — count should remain the same
    await agent().post('/api/nutrition/alerts/generate');
    const count2 = db.prepare('SELECT COUNT(*) AS cnt FROM nutrition_alerts WHERE person_id = ?').get(person.id);
    assert.equal(count2.cnt, count.cnt);
  });
});
