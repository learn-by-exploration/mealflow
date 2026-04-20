const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  setup, cleanDb, teardown, agent,
  makeRecipe, makeIngredient, addRecipeIngredient,
  makeMealPlan, makeMealPlanItem,
  makeHousehold, makePerson, assignPersonToItem,
  makeFestival, addFastingRule, linkPersonFestival,
  makeShoppingList,
} = require('./helpers');

describe('Batch 4: Data Model, Analytics & Reporting', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // PO-11: Meal rating system
  // ═══════════════════════════════════════════════════════════════
  describe('PO-11: Meal rating system', () => {
    it('POST /api/meals/:itemId/rate — rate a meal item', async () => {
      const household = makeHousehold();
      const person = makePerson(household.id);
      const recipe = makeRecipe();
      const plan = makeMealPlan();
      const item = makeMealPlanItem(plan.id, recipe.id);

      const res = await agent()
        .post(`/api/meals/${item.id}/rate`)
        .send({ rating: 4, person_id: person.id, comment: 'Delicious!' });

      assert.equal(res.status, 201);
      assert.equal(res.body.rating, 4);
      assert.equal(res.body.person_id, person.id);
      assert.equal(res.body.comment, 'Delicious!');
    });

    it('POST /api/meals/:itemId/rate — update existing rating (upsert)', async () => {
      const household = makeHousehold();
      const person = makePerson(household.id);
      const recipe = makeRecipe();
      const plan = makeMealPlan();
      const item = makeMealPlanItem(plan.id, recipe.id);

      await agent()
        .post(`/api/meals/${item.id}/rate`)
        .send({ rating: 3, person_id: person.id });

      const res = await agent()
        .post(`/api/meals/${item.id}/rate`)
        .send({ rating: 5, person_id: person.id, comment: 'Even better!' });

      assert.equal(res.status, 200);
      assert.equal(res.body.rating, 5);
      assert.equal(res.body.comment, 'Even better!');
    });

    it('POST /api/meals/:itemId/rate — rejects invalid rating', async () => {
      const household = makeHousehold();
      const person = makePerson(household.id);
      const plan = makeMealPlan();
      const recipe = makeRecipe();
      const item = makeMealPlanItem(plan.id, recipe.id);

      const res = await agent()
        .post(`/api/meals/${item.id}/rate`)
        .send({ rating: 6, person_id: person.id });

      assert.equal(res.status, 400);
    });

    it('POST /api/meals/:itemId/rate — rejects rating 0', async () => {
      const household = makeHousehold();
      const person = makePerson(household.id);
      const plan = makeMealPlan();
      const recipe = makeRecipe();
      const item = makeMealPlanItem(plan.id, recipe.id);

      const res = await agent()
        .post(`/api/meals/${item.id}/rate`)
        .send({ rating: 0, person_id: person.id });

      assert.equal(res.status, 400);
    });

    it('GET /api/meals/:itemId/ratings — get ratings for a meal item', async () => {
      const household = makeHousehold();
      const p1 = makePerson(household.id, { name: 'Alice' });
      const p2 = makePerson(household.id, { name: 'Bob' });
      const recipe = makeRecipe();
      const plan = makeMealPlan();
      const item = makeMealPlanItem(plan.id, recipe.id);

      await agent().post(`/api/meals/${item.id}/rate`).send({ rating: 4, person_id: p1.id });
      await agent().post(`/api/meals/${item.id}/rate`).send({ rating: 5, person_id: p2.id });

      const res = await agent().get(`/api/meals/${item.id}/ratings`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ratings.length, 2);
      assert.equal(res.body.average, 4.5);
    });

    it('GET /api/recipes/:id/ratings — average rating for a recipe', async () => {
      const household = makeHousehold();
      const person = makePerson(household.id);
      const recipe = makeRecipe();

      const plan1 = makeMealPlan({ date: '2026-04-01' });
      const item1 = makeMealPlanItem(plan1.id, recipe.id);
      const plan2 = makeMealPlan({ date: '2026-04-02' });
      const item2 = makeMealPlanItem(plan2.id, recipe.id);

      await agent().post(`/api/meals/${item1.id}/rate`).send({ rating: 3, person_id: person.id });
      await agent().post(`/api/meals/${item2.id}/rate`).send({ rating: 5, person_id: person.id });

      const res = await agent().get(`/api/recipes/${recipe.id}/ratings`);

      assert.equal(res.status, 200);
      assert.equal(res.body.average, 4);
      assert.equal(res.body.count, 2);
    });

    it('GET /api/recipes/:id/ratings — returns 0 for unrated recipe', async () => {
      const recipe = makeRecipe();
      const res = await agent().get(`/api/recipes/${recipe.id}/ratings`);
      assert.equal(res.status, 200);
      assert.equal(res.body.average, 0);
      assert.equal(res.body.count, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-02: Soft delete for recipes
  // ═══════════════════════════════════════════════════════════════
  describe('DE-02: Soft delete for recipes', () => {
    it('DELETE /api/recipes/:id — soft deletes (sets deleted_at)', async () => {
      const recipe = makeRecipe();

      const res = await agent().delete(`/api/recipes/${recipe.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);

      // Should not appear in listing
      const list = await agent().get('/api/recipes');
      assert.equal(list.body.data.length, 0);

      // But still in DB
      const row = db.prepare('SELECT deleted_at FROM recipes WHERE id = ?').get(recipe.id);
      assert.ok(row.deleted_at);
    });

    it('GET /api/recipes — excludes soft-deleted recipes', async () => {
      const r1 = makeRecipe({ name: 'Visible' });
      const r2 = makeRecipe({ name: 'Deleted' });
      db.prepare('UPDATE recipes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(r2.id);

      const res = await agent().get('/api/recipes');
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].name, 'Visible');
    });

    it('GET /api/recipes/search — excludes soft-deleted recipes', async () => {
      const r1 = makeRecipe({ name: 'Paneer Tikka' });
      db.prepare('UPDATE recipes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(r1.id);

      const res = await agent().get('/api/recipes/search?q=Paneer');
      assert.equal(res.body.length, 0);
    });

    it('GET /api/recipes/:id — 404 for soft-deleted recipe', async () => {
      const recipe = makeRecipe();
      db.prepare('UPDATE recipes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(recipe.id);

      const res = await agent().get(`/api/recipes/${recipe.id}`);
      assert.equal(res.status, 404);
    });

    it('GET /api/recipes/trash — lists soft-deleted recipes', async () => {
      const r1 = makeRecipe({ name: 'Deleted Recipe' });
      db.prepare('UPDATE recipes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(r1.id);
      makeRecipe({ name: 'Active Recipe' });

      const res = await agent().get('/api/recipes/trash');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].name, 'Deleted Recipe');
    });

    it('POST /api/recipes/:id/restore — restores soft-deleted recipe', async () => {
      const recipe = makeRecipe();
      db.prepare('UPDATE recipes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(recipe.id);

      const res = await agent().post(`/api/recipes/${recipe.id}/restore`);
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);

      // Should appear in listing again
      const list = await agent().get('/api/recipes');
      assert.equal(list.body.data.length, 1);
    });

    it('POST /api/recipes/:id/restore — 404 for non-deleted recipe', async () => {
      const recipe = makeRecipe();
      const res = await agent().post(`/api/recipes/${recipe.id}/restore`);
      assert.equal(res.status, 404);
    });

    it('DELETE /api/recipes/:id/permanent — hard deletes', async () => {
      const recipe = makeRecipe();
      db.prepare('UPDATE recipes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(recipe.id);

      const res = await agent().delete(`/api/recipes/${recipe.id}/permanent`);
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);

      // Gone from DB
      const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipe.id);
      assert.equal(row, undefined);
    });

    it('DELETE /api/recipes/:id/permanent — 404 for non-deleted recipe', async () => {
      const recipe = makeRecipe();
      const res = await agent().delete(`/api/recipes/${recipe.id}/permanent`);
      assert.equal(res.status, 404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-03: Recipe version history
  // ═══════════════════════════════════════════════════════════════
  describe('DE-03: Recipe version history', () => {
    it('PUT /api/recipes/:id — saves version snapshot before update', async () => {
      const recipe = makeRecipe({ name: 'Original Name' });

      await agent()
        .put(`/api/recipes/${recipe.id}`)
        .send({ name: 'Updated Name' });

      const versions = db.prepare('SELECT * FROM recipe_versions WHERE recipe_id = ?').all(recipe.id);
      assert.equal(versions.length, 1);
      assert.equal(versions[0].version, 1);

      const data = JSON.parse(versions[0].data_json);
      assert.equal(data.name, 'Original Name');
    });

    it('PUT /api/recipes/:id — increments version on each update', async () => {
      const recipe = makeRecipe({ name: 'V1' });

      await agent().put(`/api/recipes/${recipe.id}`).send({ name: 'V2' });
      await agent().put(`/api/recipes/${recipe.id}`).send({ name: 'V3' });

      const versions = db.prepare('SELECT * FROM recipe_versions WHERE recipe_id = ? ORDER BY version').all(recipe.id);
      assert.equal(versions.length, 2);
      assert.equal(versions[0].version, 1);
      assert.equal(versions[1].version, 2);
    });

    it('GET /api/recipes/:id/history — lists versions', async () => {
      const recipe = makeRecipe({ name: 'V1' });
      await agent().put(`/api/recipes/${recipe.id}`).send({ name: 'V2' });
      await agent().put(`/api/recipes/${recipe.id}`).send({ name: 'V3' });

      const res = await agent().get(`/api/recipes/${recipe.id}/history`);
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].version, 1);
      assert.equal(res.body[1].version, 2);
    });

    it('POST /api/recipes/:id/revert/:versionId — restores from version', async () => {
      const recipe = makeRecipe({ name: 'Original', description: 'Desc1' });
      await agent().put(`/api/recipes/${recipe.id}`).send({ name: 'Changed' });

      const versions = db.prepare('SELECT * FROM recipe_versions WHERE recipe_id = ?').all(recipe.id);
      const versionId = versions[0].id;

      const res = await agent().post(`/api/recipes/${recipe.id}/revert/${versionId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.name, 'Original');
    });

    it('POST /api/recipes/:id/revert/:versionId — 404 for invalid version', async () => {
      const recipe = makeRecipe();
      const res = await agent().post(`/api/recipes/${recipe.id}/revert/99999`);
      assert.equal(res.status, 404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-04: Shopping list completion tracking
  // ═══════════════════════════════════════════════════════════════
  describe('DE-04: Shopping list completion tracking', () => {
    it('auto-sets completed_at when all items checked', async () => {
      const list = makeShoppingList();
      // Add two items
      await agent().post(`/api/shopping/${list.id}/items`).send({ name: 'Milk', quantity: 1, unit: 'L' });
      await agent().post(`/api/shopping/${list.id}/items`).send({ name: 'Eggs', quantity: 12, unit: 'pcs' });

      const items = await agent().get(`/api/shopping/${list.id}`);
      const item1 = items.body.items[0];
      const item2 = items.body.items[1];

      // Check first item
      await agent().patch(`/api/shopping/${list.id}/items/${item1.id}/toggle`);
      let check1 = db.prepare('SELECT completed_at FROM shopping_lists WHERE id = ?').get(list.id);
      assert.equal(check1.completed_at, null); // not all checked yet

      // Check second item
      await agent().patch(`/api/shopping/${list.id}/items/${item2.id}/toggle`);
      let check2 = db.prepare('SELECT completed_at FROM shopping_lists WHERE id = ?').get(list.id);
      assert.ok(check2.completed_at); // all checked — completed
    });

    it('auto-clears completed_at when item unchecked', async () => {
      const list = makeShoppingList();
      await agent().post(`/api/shopping/${list.id}/items`).send({ name: 'Milk', quantity: 1, unit: 'L' });

      const items = await agent().get(`/api/shopping/${list.id}`);
      const item1 = items.body.items[0];

      // Check → completed
      await agent().patch(`/api/shopping/${list.id}/items/${item1.id}/toggle`);
      let check1 = db.prepare('SELECT completed_at FROM shopping_lists WHERE id = ?').get(list.id);
      assert.ok(check1.completed_at);

      // Uncheck → not completed
      await agent().patch(`/api/shopping/${list.id}/items/${item1.id}/toggle`);
      let check2 = db.prepare('SELECT completed_at FROM shopping_lists WHERE id = ?').get(list.id);
      assert.equal(check2.completed_at, null);
    });

    it('returned in GET /api/shopping response', async () => {
      const list = makeShoppingList();
      const res = await agent().get('/api/shopping');
      assert.equal(res.body[0].completed_at, null);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-05: Meal plan notes
  // ═══════════════════════════════════════════════════════════════
  describe('DE-05: Meal plan notes', () => {
    it('POST /api/meals — creates plan with notes', async () => {
      const res = await agent()
        .post('/api/meals')
        .send({ date: '2026-04-10', meal_type: 'lunch', notes: 'Birthday celebration!' });

      assert.equal(res.status, 201);
      assert.equal(res.body.notes, 'Birthday celebration!');
    });

    it('PUT /api/meals/:id — updates notes', async () => {
      const plan = makeMealPlan();

      const res = await agent()
        .put(`/api/meals/${plan.id}`)
        .send({ notes: 'Updated note' });

      assert.equal(res.status, 200);
      assert.equal(res.body.notes, 'Updated note');
    });

    it('GET /api/meals/:date — returns notes', async () => {
      db.prepare('UPDATE meal_plans SET notes = ? WHERE id = ?').run('Test note', makeMealPlan().id);

      const res = await agent().get('/api/meals/2026-04-05');
      assert.equal(res.status, 200);
      assert.equal(res.body.meals[0].notes, 'Test note');
    });

    it('notes defaults to empty string', async () => {
      const res = await agent()
        .post('/api/meals')
        .send({ date: '2026-04-11', meal_type: 'dinner' });

      assert.equal(res.body.notes, '');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-06: Most-cooked recipes report
  // ═══════════════════════════════════════════════════════════════
  describe('DE-06: Most-cooked recipes report', () => {
    it('GET /api/stats/top-recipes — returns recipes ranked by frequency', async () => {
      const r1 = makeRecipe({ name: 'Dal' });
      const r2 = makeRecipe({ name: 'Rice' });

      // Dal used 3 times, Rice 1 time
      for (let i = 0; i < 3; i++) {
        const plan = makeMealPlan({ date: `2026-04-0${i + 1}` });
        makeMealPlanItem(plan.id, r1.id);
      }
      const plan4 = makeMealPlan({ date: '2026-04-04' });
      makeMealPlanItem(plan4.id, r2.id);

      const res = await agent().get('/api/stats/top-recipes?days=30');
      assert.equal(res.status, 200);
      assert.ok(res.body.length >= 2);
      assert.equal(res.body[0].name, 'Dal');
      assert.equal(res.body[0].count, 3);
      assert.equal(res.body[1].name, 'Rice');
    });

    it('GET /api/stats/top-recipes — limits to 10', async () => {
      for (let i = 0; i < 15; i++) {
        const r = makeRecipe({ name: `Recipe ${i}` });
        const plan = makeMealPlan({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, meal_type: 'lunch' });
        makeMealPlanItem(plan.id, r.id);
      }

      const res = await agent().get('/api/stats/top-recipes?days=30');
      assert.ok(res.body.length <= 10);
    });

    it('GET /api/stats/top-recipes — respects days filter', async () => {
      const r1 = makeRecipe({ name: 'Recent' });
      const plan1 = makeMealPlan({ date: '2026-04-05' });
      makeMealPlanItem(plan1.id, r1.id);

      const r2 = makeRecipe({ name: 'Old' });
      const plan2 = makeMealPlan({ date: '2025-01-01' });
      makeMealPlanItem(plan2.id, r2.id);

      const res = await agent().get('/api/stats/top-recipes?days=30');
      assert.ok(res.body.every(r => r.name !== 'Old'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-08: Ingredient usage frequency
  // ═══════════════════════════════════════════════════════════════
  describe('DE-08: Ingredient usage frequency', () => {
    it('GET /api/stats/ingredient-usage — returns top ingredients in meal plans', async () => {
      const ing1 = makeIngredient({ name: 'Onion' });
      const ing2 = makeIngredient({ name: 'Tomato' });
      const recipe = makeRecipe();
      addRecipeIngredient(recipe.id, ing1.id);
      addRecipeIngredient(recipe.id, ing2.id, { position: 1 });

      const plan = makeMealPlan();
      makeMealPlanItem(plan.id, recipe.id);

      const res = await agent().get('/api/stats/ingredient-usage?days=30');
      assert.equal(res.status, 200);
      assert.ok(res.body.length >= 2);
      assert.ok(res.body.some(i => i.name === 'Onion'));
      assert.ok(res.body.some(i => i.name === 'Tomato'));
    });

    it('GET /api/stats/ingredient-usage — limits to 10', async () => {
      const recipe = makeRecipe();
      for (let i = 0; i < 15; i++) {
        const ing = makeIngredient({ name: `Ingredient ${i}` });
        addRecipeIngredient(recipe.id, ing.id, { position: i });
      }
      const plan = makeMealPlan();
      makeMealPlanItem(plan.id, recipe.id);

      const res = await agent().get('/api/stats/ingredient-usage?days=30');
      assert.ok(res.body.length <= 10);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-09: Meal variety score
  // ═══════════════════════════════════════════════════════════════
  describe('DE-09: Meal variety score', () => {
    it('GET /api/stats/variety — returns score 0-100', async () => {
      const r1 = makeRecipe({ name: 'A' });
      const r2 = makeRecipe({ name: 'B' });

      // Use relative dates so test doesn't go stale
      const today = new Date();
      const d = (offset) => new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);

      // 2 unique recipes in 4 meals = 50%
      const plan1 = makeMealPlan({ date: d(1) });
      makeMealPlanItem(plan1.id, r1.id);
      const plan2 = makeMealPlan({ date: d(2) });
      makeMealPlanItem(plan2.id, r2.id);
      const plan3 = makeMealPlan({ date: d(3) });
      makeMealPlanItem(plan3.id, r1.id);
      const plan4 = makeMealPlan({ date: d(4) });
      makeMealPlanItem(plan4.id, r2.id);

      const res = await agent().get('/api/stats/variety?days=14');
      assert.equal(res.status, 200);
      assert.ok(res.body.score >= 0 && res.body.score <= 100);
      assert.equal(res.body.unique_recipes, 2);
      assert.equal(res.body.total_meals, 4);
    });

    it('GET /api/stats/variety — 0 when no meals', async () => {
      const res = await agent().get('/api/stats/variety?days=14');
      assert.equal(res.body.score, 0);
    });

    it('GET /api/stats/variety — 100 when all unique', async () => {
      const r1 = makeRecipe({ name: 'A' });
      const r2 = makeRecipe({ name: 'B' });
      const r3 = makeRecipe({ name: 'C' });

      const today = new Date();
      const d = (offset) => new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);

      const plan1 = makeMealPlan({ date: d(1) });
      makeMealPlanItem(plan1.id, r1.id);
      const plan2 = makeMealPlan({ date: d(2) });
      makeMealPlanItem(plan2.id, r2.id);
      const plan3 = makeMealPlan({ date: d(3) });
      makeMealPlanItem(plan3.id, r3.id);

      const res = await agent().get('/api/stats/variety?days=14');
      assert.equal(res.body.score, 100);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-10: Cost trend report
  // ═══════════════════════════════════════════════════════════════
  describe('DE-10: Cost trend report', () => {
    it('GET /api/cost/trend — returns daily costs over time', async () => {
      const ing = makeIngredient({ name: 'Rice' });
      // Set ingredient price
      db.prepare('UPDATE ingredients SET price_per_unit = 0.05 WHERE id = ?').run(ing.id);

      const recipe = makeRecipe();
      addRecipeIngredient(recipe.id, ing.id, { quantity: 200 });

      const plan = makeMealPlan({ date: '2026-04-01' });
      makeMealPlanItem(plan.id, recipe.id);

      const res = await agent().get('/api/cost/trend?days=30');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
      assert.ok('date' in res.body[0]);
      assert.ok('cost' in res.body[0]);
    });

    it('GET /api/cost/trend — returns empty array when no data', async () => {
      const res = await agent().get('/api/cost/trend?days=30');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-11: Festival meal compliance report
  // ═══════════════════════════════════════════════════════════════
  describe('DE-11: Festival meal compliance report', () => {
    it('GET /api/festivals/compliance — reports compliance per person', async () => {
      const household = makeHousehold();
      const person = makePerson(household.id, { name: 'Grandma' });

      const festival = makeFestival({
        name: 'Ekadashi',
        is_fasting: 1,
        date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-10' } }),
      });
      addFastingRule(festival.id, { rule_type: 'deny', category: 'grains' });
      linkPersonFestival(person.id, festival.id);

      // Set up meal with grain ingredient
      const ing = makeIngredient({ name: 'Rice', category: 'grains' });
      const recipe = makeRecipe({ name: 'Rice Bowl' });
      addRecipeIngredient(recipe.id, ing.id);

      const plan = makeMealPlan({ date: '2026-04-10' });
      const item = makeMealPlanItem(plan.id, recipe.id);
      assignPersonToItem(item.id, person.id);

      const res = await agent().get('/api/festivals/compliance?date=2026-04-10');
      assert.equal(res.status, 200);
      assert.equal(res.body.compliant, false);
      assert.ok(res.body.violations.length > 0);
      assert.equal(res.body.violations[0].person_name, 'Grandma');
    });

    it('GET /api/festivals/compliance — compliant when no violations', async () => {
      const household = makeHousehold();
      const person = makePerson(household.id);

      const festival = makeFestival({
        name: 'Simple Fast',
        is_fasting: 1,
        date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-10' } }),
      });
      addFastingRule(festival.id, { rule_type: 'deny', category: 'meat' });
      linkPersonFestival(person.id, festival.id);

      // Meal with no denied ingredients
      const ing = makeIngredient({ name: 'Potato', category: 'vegetables' });
      const recipe = makeRecipe({ name: 'Potato Fry' });
      addRecipeIngredient(recipe.id, ing.id);

      const plan = makeMealPlan({ date: '2026-04-10' });
      const item = makeMealPlanItem(plan.id, recipe.id);
      assignPersonToItem(item.id, person.id);

      const res = await agent().get('/api/festivals/compliance?date=2026-04-10');
      assert.equal(res.status, 200);
      assert.equal(res.body.compliant, true);
      assert.equal(res.body.violations.length, 0);
    });

    it('GET /api/festivals/compliance — 400 without date param', async () => {
      const res = await agent().get('/api/festivals/compliance');
      assert.equal(res.status, 400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DE-12: Data export in multiple formats
  // ═══════════════════════════════════════════════════════════════
  describe('DE-12: Data export in multiple formats', () => {
    it('GET /api/data/export?format=json — returns JSON (default)', async () => {
      makeRecipe({ name: 'Test Export' });
      const res = await agent().get('/api/data/export?format=json');
      assert.equal(res.status, 200);
      assert.ok(res.body.recipes);
      assert.equal(res.body.recipes.length, 1);
    });

    it('GET /api/data/export — defaults to JSON', async () => {
      const res = await agent().get('/api/data/export');
      assert.equal(res.status, 200);
      assert.ok(res.body.version);
    });

    it('GET /api/data/export?format=csv — returns CSV', async () => {
      const ing = makeIngredient({ name: 'Sugar' });
      const recipe = makeRecipe({ name: 'Sweet Dish' });
      addRecipeIngredient(recipe.id, ing.id);

      const res = await agent().get('/api/data/export?format=csv');
      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');

      const text = res.text;
      // Should contain CSV sections
      assert.ok(text.includes('--- RECIPES ---'));
      assert.ok(text.includes('--- INGREDIENTS ---'));
      assert.ok(text.includes('Sweet Dish'));
      assert.ok(text.includes('Sugar'));
    });

    it('GET /api/data/export?format=invalid — returns 400', async () => {
      const res = await agent().get('/api/data/export?format=xml');
      assert.equal(res.status, 400);
    });
  });
});
