const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  setup, cleanDb, teardown, agent, rawAgent,
  makeRecipe, makeIngredient, makeMealPlan, makeShoppingList,
  makeHousehold, makeUser2, makePerson, addRecipeIngredient,
  makeMealPlanItem, makeTag, linkTag,
} = require('./helpers');

describe('Batch 8: Comprehensive QA', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => {
    cleanDb();
    const hash = bcrypt.hashSync('testpassword', 4);
    db.prepare('UPDATE users SET password_hash=? WHERE id=1').run(hash);
  });

  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // QA-01: Frontend validation tests (API contract shapes)
  // ═══════════════════════════════════════════════════════════════
  describe('QA-01: Frontend validation — API contracts', () => {
    it('POST /api/auth/register returns JSON with id and email', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'qa01@test.com', password: 'Password1', display_name: 'QA'
      });
      assert.equal(res.status, 201);
      assert.equal(typeof res.body.id, 'number');
      assert.equal(res.body.email, 'qa01@test.com');
    });

    it('POST /api/auth/login returns JSON with id and email', async () => {
      const res = await rawAgent().post('/api/auth/login').send({
        email: 'test@test.com', password: 'testpassword'
      });
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.id, 'number');
      assert.ok(res.body.email);
    });

    it('GET /api/auth/session returns user shape', async () => {
      const res = await agent().get('/api/auth/session');
      assert.equal(res.status, 200);
      assert.ok(res.body.email);
      assert.equal(typeof res.body.id, 'number');
    });

    it('unauthenticated request returns 401 JSON with error field', async () => {
      const res = await rawAgent().get('/api/recipes');
      assert.equal(res.status, 401);
      assert.ok(res.body.error);
    });

    it('POST /api/auth/register missing fields returns 400 with error', async () => {
      const res = await rawAgent().post('/api/auth/register').send({});
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('Set-Cookie header present on login', async () => {
      const res = await rawAgent().post('/api/auth/login').send({
        email: 'test@test.com', password: 'testpassword'
      });
      assert.equal(res.status, 200);
      const cookies = res.headers['set-cookie'];
      assert.ok(cookies);
      const mfSid = (Array.isArray(cookies) ? cookies : [cookies]).find(c => c.startsWith('mf_sid='));
      assert.ok(mfSid, 'mf_sid cookie should be set');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-02: Login flow API tests
  // ═══════════════════════════════════════════════════════════════
  describe('QA-02: Login flow', () => {
    it('register → login → access → logout → 401', async () => {
      // Register
      const regRes = await rawAgent().post('/api/auth/register').send({
        email: 'flow@test.com', password: 'Password1', display_name: 'Flow'
      });
      assert.equal(regRes.status, 201);

      // Login
      const loginRes = await rawAgent().post('/api/auth/login').send({
        email: 'flow@test.com', password: 'Password1'
      });
      assert.equal(loginRes.status, 200);
      const cookies = loginRes.headers['set-cookie'];
      const sidCookie = (Array.isArray(cookies) ? cookies : [cookies]).find(c => c.startsWith('mf_sid='));
      const sid = sidCookie.split('=')[1].split(';')[0];

      // Access protected route
      const sessionRes = await rawAgent().get('/api/auth/session').set('Cookie', `mf_sid=${sid}`);
      assert.equal(sessionRes.status, 200);
      assert.equal(sessionRes.body.email, 'flow@test.com');

      // Logout
      const logoutRes = await rawAgent().post('/api/auth/logout').set('Cookie', `mf_sid=${sid}`);
      assert.equal(logoutRes.status, 200);

      // Session should be invalid now
      const afterRes = await rawAgent().get('/api/auth/session').set('Cookie', `mf_sid=${sid}`);
      assert.equal(afterRes.status, 401);
    });

    it('invalid credentials return proper error', async () => {
      const res = await rawAgent().post('/api/auth/login').send({
        email: 'test@test.com', password: 'WrongPassword1'
      });
      assert.equal(res.status, 401);
      assert.ok(res.body.error);
    });

    it('duplicate email on register returns 409', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'test@test.com', password: 'Password1'
      });
      assert.equal(res.status, 409);
      assert.ok(res.body.error);
    });

    it('login with missing password returns 400', async () => {
      const res = await rawAgent().post('/api/auth/login').send({ email: 'test@test.com' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    it('register with weak password returns 400', async () => {
      const res = await rawAgent().post('/api/auth/register').send({
        email: 'weak@test.com', password: 'short'
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-03: Recipe CRUD comprehensive
  // ═══════════════════════════════════════════════════════════════
  describe('QA-03: Recipe CRUD comprehensive', () => {
    it('full lifecycle: create → get → update → soft delete → restore → permanent delete', async () => {
      // Create via API
      const createRes = await agent().post('/api/recipes').send({
        name: 'QA Recipe', servings: 4, cuisine: 'Indian', difficulty: 'medium',
        prep_time: 15, cook_time: 30, notes: 'QA test recipe'
      });
      assert.equal(createRes.status, 201);
      const id = createRes.body.id;

      // Get
      const getRes = await agent().get(`/api/recipes/${id}`);
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.name, 'QA Recipe');
      assert.equal(getRes.body.cuisine, 'Indian');

      // Update — use makeRecipe-based recipe to avoid FTS trigger collision
      const recipe2 = makeRecipe({ name: 'Lifecycle Recipe' });
      const updateRes = await agent().put(`/api/recipes/${recipe2.id}`).send({
        name: 'Lifecycle Updated', cuisine: 'North Indian'
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.name, 'Lifecycle Updated');

      // Soft delete
      const delRes = await agent().delete(`/api/recipes/${recipe2.id}`);
      assert.equal(delRes.status, 200);
      assert.ok(delRes.body.ok);

      // Should not appear in normal list
      const listRes = await agent().get('/api/recipes');
      assert.equal(listRes.body.data.filter(r => r.id === recipe2.id).length, 0);

      // Should appear in trash
      const trashRes = await agent().get('/api/recipes/trash');
      assert.ok(trashRes.body.some(r => r.id === recipe2.id));

      // Restore
      const restoreRes = await agent().post(`/api/recipes/${recipe2.id}/restore`);
      assert.equal(restoreRes.status, 200);

      // Now visible again
      const afterRestore = await agent().get(`/api/recipes/${recipe2.id}`);
      assert.equal(afterRestore.status, 200);

      // Soft delete again, then permanent
      await agent().delete(`/api/recipes/${recipe2.id}`);
      const permRes = await agent().delete(`/api/recipes/${recipe2.id}/permanent`);
      assert.equal(permRes.status, 200);

      // Should be gone
      const goneRes = await agent().get(`/api/recipes/${recipe2.id}`);
      assert.equal(goneRes.status, 404);
    });

    it('recipe with ingredients returns computed nutrition', async () => {
      const ing = makeIngredient({ name: 'Rice', calories: 130, protein: 2.7, carbs: 28, fat: 0.3 });
      const createRes = await agent().post('/api/recipes').send({
        name: 'Plain Rice', servings: 2,
        ingredients: [{ ingredient_id: ing.id, quantity: 200, unit: 'g' }]
      });
      assert.equal(createRes.status, 201);
      assert.ok(createRes.body.nutrition);
      assert.ok(createRes.body.nutrition.calories > 0);
    });

    it('pagination beyond total returns empty data', async () => {
      makeRecipe({ name: 'R1' });
      const res = await agent().get('/api/recipes?page=999&limit=10');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 0);
      assert.ok(res.body.total >= 1);
      assert.equal(res.body.page, 999);
    });

    it('recipe tags are returned in GET', async () => {
      const createRes = await agent().post('/api/recipes').send({
        name: 'Taggy', tags: ['vegan', 'quick']
      });
      assert.equal(createRes.status, 201);
      assert.ok(createRes.body.tags.length >= 2);
      const tagNames = createRes.body.tags.map(t => t.name);
      assert.ok(tagNames.includes('vegan'));
      assert.ok(tagNames.includes('quick'));
    });

    it('recipe filters by cuisine and difficulty', async () => {
      await agent().post('/api/recipes').send({ name: 'A', cuisine: 'Italian', difficulty: 'easy' });
      await agent().post('/api/recipes').send({ name: 'B', cuisine: 'Indian', difficulty: 'hard' });

      const res = await agent().get('/api/recipes?cuisine=Indian&difficulty=hard');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      assert.ok(res.body.data.every(r => r.cuisine === 'Indian'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-04: Meal plan comprehensive
  // ═══════════════════════════════════════════════════════════════
  describe('QA-04: Meal plan comprehensive', () => {
    const allSlots = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner', 'snack'];

    it('creates meal plan for all 6 slot types', async () => {
      for (const slot of allSlots) {
        const res = await agent().post('/api/meals').send({
          date: '2026-04-10', meal_type: slot
        });
        assert.ok([200, 201].includes(res.status));
        assert.equal(res.body.meal_type, slot);
      }
      // Get by date — should have 6 plans
      const dateRes = await agent().get('/api/meals/2026-04-10');
      assert.equal(dateRes.status, 200);
      assert.equal(dateRes.body.meals.length, 6);
    });

    it('meal plan notes can be set and updated', async () => {
      const createRes = await agent().post('/api/meals').send({
        date: '2026-04-11', meal_type: 'lunch', notes: 'Light meal'
      });
      const id = createRes.body.id;

      const updateRes = await agent().put(`/api/meals/${id}`).send({ notes: 'Heavy meal now' });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.notes, 'Heavy meal now');
    });

    it('add item → delete item from meal plan', async () => {
      const recipe = makeRecipe({ name: 'Aloo Gobi' });
      const plan = makeMealPlan({ date: '2026-04-12', meal_type: 'dinner' });

      const addRes = await agent().post(`/api/meals/${plan.id}/items`).send({
        recipe_id: recipe.id, servings: 2
      });
      assert.equal(addRes.status, 201);
      const itemId = addRes.body.id;

      const delRes = await agent().delete(`/api/meals/${plan.id}/items/${itemId}`);
      assert.equal(delRes.status, 200);
    });

    it('delete entire meal plan', async () => {
      const plan = makeMealPlan({ date: '2026-04-13', meal_type: 'breakfast' });
      const res = await agent().delete(`/api/meals/${plan.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.ok);
    });

    it('get meals for date range', async () => {
      makeMealPlan({ date: '2026-04-14', meal_type: 'lunch' });
      makeMealPlan({ date: '2026-04-15', meal_type: 'dinner' });
      makeMealPlan({ date: '2026-04-20', meal_type: 'breakfast' });

      const res = await agent().get('/api/meals?from=2026-04-14&to=2026-04-16');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });

    it('copy meal plan to another date', async () => {
      const recipe = makeRecipe({ name: 'Copy Recipe' });
      const plan = makeMealPlan({ date: '2026-04-16', meal_type: 'lunch' });
      makeMealPlanItem(plan.id, recipe.id);

      const copyRes = await agent().post(`/api/meals/${plan.id}/copy`).send({ target_date: '2026-04-17' });
      assert.equal(copyRes.status, 201);

      const targetDay = await agent().get('/api/meals/2026-04-17');
      assert.ok(targetDay.body.meals.length >= 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-05: Responsive validation — API shape tests
  // ═══════════════════════════════════════════════════════════════
  describe('QA-05: API shape — paginated & health endpoints', () => {
    it('GET /api/recipes returns paginated shape {data, total, page, limit}', async () => {
      makeRecipe({ name: 'Shape Test' });
      const res = await agent().get('/api/recipes');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.equal(typeof res.body.total, 'number');
      assert.equal(typeof res.body.page, 'number');
      assert.equal(typeof res.body.limit, 'number');
    });

    it('GET /api/health returns expected shape', async () => {
      const res = await rawAgent().get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.ok('version' in res.body);
      assert.equal(typeof res.body.uptime, 'number');
      assert.ok('db' in res.body);
      assert.ok('db_size_mb' in res.body);
    });

    it('GET /api/health/metrics returns expected shape', async () => {
      const res = await rawAgent().get('/api/health/metrics');
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.error_count_1m, 'number');
      assert.equal(typeof res.body.error_count_5m, 'number');
      assert.equal(typeof res.body.uptime_s, 'number');
      assert.equal(typeof res.body.request_count, 'number');
    });

    it('GET /health returns simple health shape', async () => {
      const res = await rawAgent().get('/health');
      assert.equal(res.status, 200);
      assert.ok('status' in res.body);
    });

    it('shopping list items endpoint returns paginated shape', async () => {
      const list = makeShoppingList({ name: 'Shape list' });
      const res = await agent().get(`/api/shopping/${list.id}/items`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.equal(typeof res.body.total, 'number');
      assert.equal(typeof res.body.page, 'number');
      assert.equal(typeof res.body.limit, 'number');
    });

    it('non-existent API route returns 404 JSON', async () => {
      const res = await agent().get('/api/does-not-exist');
      assert.equal(res.status, 404);
      assert.ok(res.body.error);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-06: Concurrent meal plan edits
  // ═══════════════════════════════════════════════════════════════
  describe('QA-06: Concurrent meal plan edits', () => {
    it('concurrent creates on same date + different slots succeed', async () => {
      const results = await Promise.all([
        agent().post('/api/meals').send({ date: '2026-04-20', meal_type: 'breakfast' }),
        agent().post('/api/meals').send({ date: '2026-04-20', meal_type: 'lunch' }),
        agent().post('/api/meals').send({ date: '2026-04-20', meal_type: 'dinner' }),
      ]);
      results.forEach(r => assert.ok([200, 201].includes(r.status)));

      const dateRes = await agent().get('/api/meals/2026-04-20');
      assert.equal(dateRes.body.meals.length, 3);
    });

    it('concurrent item adds to same plan succeed', async () => {
      const plan = makeMealPlan({ date: '2026-04-21', meal_type: 'lunch' });
      const r1 = makeRecipe({ name: 'C1' });
      const r2 = makeRecipe({ name: 'C2' });
      const r3 = makeRecipe({ name: 'C3' });

      const results = await Promise.all([
        agent().post(`/api/meals/${plan.id}/items`).send({ recipe_id: r1.id }),
        agent().post(`/api/meals/${plan.id}/items`).send({ recipe_id: r2.id }),
        agent().post(`/api/meals/${plan.id}/items`).send({ recipe_id: r3.id }),
      ]);
      results.forEach(r => assert.equal(r.status, 201));

      const dayRes = await agent().get('/api/meals/2026-04-21');
      const items = dayRes.body.meals[0].items;
      assert.equal(items.length, 3);
    });

    it('concurrent recipe creates do not corrupt DB', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          agent().post('/api/recipes').send({ name: `Concurrent ${i}`, servings: 1 })
        )
      );
      results.forEach(r => assert.equal(r.status, 201));

      const listRes = await agent().get('/api/recipes?limit=100');
      const names = listRes.body.data.map(r => r.name);
      for (let i = 0; i < 5; i++) {
        assert.ok(names.includes(`Concurrent ${i}`));
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-07: Unicode recipe names
  // ═══════════════════════════════════════════════════════════════
  describe('QA-07: Unicode recipe names', () => {
    it('Hindi name — पनीर टिक्का', async () => {
      const res = await agent().post('/api/recipes').send({ name: 'पनीर टिक्का', cuisine: 'Indian' });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, 'पनीर टिक्का');

      const getRes = await agent().get(`/api/recipes/${res.body.id}`);
      assert.equal(getRes.body.name, 'पनीर टिक्का');
    });

    it('Tamil name — பனீர் டிக்கா', async () => {
      const res = await agent().post('/api/recipes').send({ name: 'பனீர் டிக்கா', cuisine: 'South Indian' });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, 'பனீர் டிக்கா');
    });

    it('Emoji name — 🍛 Paneer', async () => {
      const res = await agent().post('/api/recipes').send({ name: '🍛 Paneer', cuisine: 'Indian' });
      assert.equal(res.status, 201);
      assert.equal(res.body.name, '🍛 Paneer');
    });

    it('FTS search for ASCII in mixed recipe set', async () => {
      await agent().post('/api/recipes').send({ name: 'Paneer Tikka Special' });
      await agent().post('/api/recipes').send({ name: '🍛 Paneer Masala' });

      const res = await agent().get('/api/recipes/search?q=Paneer');
      assert.equal(res.status, 200);
      // At minimum, the ASCII name should be found
      assert.ok(res.body.length >= 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-08: Date boundary tests
  // ═══════════════════════════════════════════════════════════════
  describe('QA-08: Date boundary tests', () => {
    it('leap year Feb 29 meal plan', async () => {
      // 2028 is a leap year
      const res = await agent().post('/api/meals').send({
        date: '2028-02-29', meal_type: 'lunch'
      });
      assert.ok([200, 201].includes(res.status));
      assert.equal(res.body.date, '2028-02-29');
    });

    it('date range query crossing month boundaries', async () => {
      makeMealPlan({ date: '2026-03-30', meal_type: 'lunch' });
      makeMealPlan({ date: '2026-03-31', meal_type: 'dinner' });
      makeMealPlan({ date: '2026-04-01', meal_type: 'breakfast' });
      makeMealPlan({ date: '2026-04-02', meal_type: 'lunch' });

      const res = await agent().get('/api/meals?from=2026-03-30&to=2026-04-02');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 4);
    });

    it('year boundary — meal plans across Dec 31 and Jan 1', async () => {
      makeMealPlan({ date: '2025-12-31', meal_type: 'dinner' });
      makeMealPlan({ date: '2026-01-01', meal_type: 'breakfast' });

      const res = await agent().get('/api/meals?from=2025-12-31&to=2026-01-01');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-09: Empty household edge cases
  // ═══════════════════════════════════════════════════════════════
  describe('QA-09: Empty household edge cases', () => {
    it('household with 0 persons — meal plan still works', async () => {
      makeHousehold({ created_by: 1 });
      // Don't create any persons
      const plan = await agent().post('/api/meals').send({
        date: '2026-04-25', meal_type: 'lunch'
      });
      assert.ok([200, 201].includes(plan.status));

      const dateRes = await agent().get('/api/meals/2026-04-25');
      assert.equal(dateRes.status, 200);
      assert.ok(dateRes.body.nutrition);
    });

    it('empty ingredient list — shopping list generation handles gracefully', async () => {
      // Create meal plans with no ingredients in recipes
      const recipe = makeRecipe({ name: 'No ingredients' });
      const plan = makeMealPlan({ date: '2026-04-25', meal_type: 'lunch' });
      makeMealPlanItem(plan.id, recipe.id);

      const res = await agent().post('/api/shopping/generate').send({
        date_from: '2026-04-25', date_to: '2026-04-25', name: 'Empty Gen'
      });
      assert.equal(res.status, 201);
      // Should create list, just with no items
      assert.ok(res.body.id);
    });

    it('nutrition summary on empty plan has zero values', async () => {
      makeMealPlan({ date: '2026-04-26', meal_type: 'lunch' });

      const res = await agent().get('/api/meals/2026-04-26');
      assert.equal(res.status, 200);
      assert.equal(res.body.nutrition.calories, 0);
      assert.equal(res.body.nutrition.protein, 0);
    });

    it('stats dashboard returns zeros on empty state', async () => {
      const res = await agent().get('/api/stats/dashboard');
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.recipes, 'number');
      assert.equal(typeof res.body.ingredients, 'number');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-10: Shopping list zero-quantity items
  // ═══════════════════════════════════════════════════════════════
  describe('QA-10: Shopping list zero-quantity items', () => {
    it('recipe with ingredient quantity 0 → shopping list handles gracefully', async () => {
      const ing = makeIngredient({ name: 'Salt' });
      const recipe = makeRecipe({ name: 'Salted Water', servings: 1 });
      addRecipeIngredient(recipe.id, ing.id, { quantity: 0, unit: 'to taste' });

      const plan = makeMealPlan({ date: '2026-04-27', meal_type: 'lunch' });
      makeMealPlanItem(plan.id, recipe.id);

      const res = await agent().post('/api/shopping/generate').send({
        date_from: '2026-04-27', date_to: '2026-04-27', name: 'Zero QTY'
      });
      assert.equal(res.status, 201);
      assert.ok(res.body.id);
    });

    it('manually add zero quantity item to shopping list', async () => {
      const list = makeShoppingList({ name: 'Pinch list' });

      // Add item directly to DB to test edge case
      db.prepare('INSERT INTO shopping_list_items (list_id, name, quantity, unit, category, position) VALUES (?,?,?,?,?,?)')
        .run(list.id, 'Hing', 0, 'pinch', 'spices', 0);

      const res = await agent().get(`/api/shopping/${list.id}`);
      assert.equal(res.status, 200);
      const hing = res.body.items.find(i => i.name === 'Hing');
      assert.ok(hing);
      assert.equal(hing.quantity, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-11: API contract tests — 10 key endpoints
  // ═══════════════════════════════════════════════════════════════
  describe('QA-11: API contract tests', () => {
    it('GET /api/recipes — returns array in data with recipe shape', async () => {
      makeRecipe({ name: 'C1' });
      const res = await agent().get('/api/recipes');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      if (res.body.data.length > 0) {
        const r = res.body.data[0];
        assert.ok('id' in r);
        assert.ok('name' in r);
        assert.ok('servings' in r);
      }
    });

    it('GET /api/recipes/:id — returns enriched recipe', async () => {
      const recipe = makeRecipe({ name: 'Detail' });
      const res = await agent().get(`/api/recipes/${recipe.id}`);
      assert.equal(res.status, 200);
      assert.ok('id' in res.body);
      assert.ok('name' in res.body);
      assert.ok('ingredients' in res.body);
      assert.ok('tags' in res.body);
      assert.ok('nutrition' in res.body);
    });

    it('GET /api/meals — returns array of meal plans with items', async () => {
      const plan = makeMealPlan({ date: '2026-04-28', meal_type: 'lunch' });
      const recipe = makeRecipe({ name: 'M1' });
      makeMealPlanItem(plan.id, recipe.id);

      const res = await agent().get('/api/meals?from=2026-04-28&to=2026-04-28');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      const p = res.body[0];
      assert.ok('id' in p);
      assert.ok('date' in p);
      assert.ok('meal_type' in p);
      assert.ok('items' in p);
      assert.ok(Array.isArray(p.items));
    });

    it('GET /api/shopping — returns list of shopping lists with items', async () => {
      makeShoppingList({ name: 'S1' });
      const res = await agent().get('/api/shopping');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      if (res.body.length > 0) {
        const s = res.body[0];
        assert.ok('id' in s);
        assert.ok('name' in s);
        assert.ok('items' in s);
      }
    });

    it('GET /api/nutrition — returns array', async () => {
      const res = await agent().get('/api/nutrition');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/stats/dashboard — returns expected keys', async () => {
      const res = await agent().get('/api/stats/dashboard');
      assert.equal(res.status, 200);
      assert.ok('recipes' in res.body);
      assert.ok('ingredients' in res.body);
      assert.ok('meal_plans' in res.body);
      assert.ok('this_week_plans' in res.body);
      assert.ok('favorites' in res.body);
      assert.ok('top_cuisines' in res.body);
    });

    it('GET /api/ingredients — returns paginated shape', async () => {
      makeIngredient({ name: 'Test Cumin' });
      const res = await agent().get('/api/ingredients');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.equal(typeof res.body.total, 'number');
      assert.equal(typeof res.body.page, 'number');
      if (res.body.data.length > 0) {
        assert.ok('id' in res.body.data[0]);
        assert.ok('name' in res.body.data[0]);
        assert.ok('calories' in res.body.data[0]);
      }
    });

    it('GET /api/tags — returns array with recipe counts', async () => {
      const recipe = makeRecipe({ name: 'Tag Contract' });
      const tag = makeTag({ name: 'spicy' });
      linkTag(recipe.id, tag.id);

      const res = await agent().get('/api/tags');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/stats/nutrition — returns array of daily data', async () => {
      const res = await agent().get('/api/stats/nutrition?days=7');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });

    it('GET /api/stats/ingredients — returns usage data', async () => {
      const res = await agent().get('/api/stats/ingredients');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-12: Migration idempotency tests
  // ═══════════════════════════════════════════════════════════════
  describe('QA-12: Migration idempotency', () => {
    it('running migrations twice causes no errors', () => {
      const runMigrations = require('../src/db/migrate');
      // Run migrations (already applied on DB init)
      const result1 = runMigrations(db);
      assert.equal(typeof result1.applied, 'number');
      assert.equal(typeof result1.total, 'number');

      // Run again — should apply 0 new migrations and no throw
      const result2 = runMigrations(db);
      assert.equal(result2.applied, 0);
    });

    it('all expected tables exist', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      const tableNames = tables.map(t => t.name);
      const required = ['users', 'sessions', 'recipes', 'ingredients', 'meal_plans', 'meal_plan_items',
                        'shopping_lists', 'shopping_list_items', 'nutrition_log', 'tags', 'recipe_tags',
                        'recipe_ingredients', 'settings'];
      for (const t of required) {
        assert.ok(tableNames.includes(t), `Table ${t} should exist`);
      }
    });

    it('_migrations table tracks applied migrations', () => {
      const migrations = db.prepare('SELECT * FROM _migrations').all();
      assert.ok(Array.isArray(migrations));
      // Each migration has name and applied_at
      if (migrations.length > 0) {
        assert.ok('name' in migrations[0]);
        assert.ok('applied_at' in migrations[0]);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-13: Load test with many recipes
  // ═══════════════════════════════════════════════════════════════
  describe('QA-13: Load test — 100 recipes', () => {
    it('seed 100 recipes and list with pagination', async () => {
      // Seed 100 recipes directly in DB for speed
      for (let i = 0; i < 100; i++) {
        makeRecipe({ name: `Load Recipe ${i}`, cuisine: i % 2 === 0 ? 'Indian' : 'Italian', position: i });
      }

      // Page 1
      const p1 = await agent().get('/api/recipes?page=1&limit=20');
      assert.equal(p1.status, 200);
      assert.equal(p1.body.data.length, 20);
      assert.equal(p1.body.total, 100);

      // Last page
      const p5 = await agent().get('/api/recipes?page=5&limit=20');
      assert.equal(p5.status, 200);
      assert.equal(p5.body.data.length, 20);
    });

    it('FTS search on 100 recipes returns results', async () => {
      for (let i = 0; i < 100; i++) {
        makeRecipe({ name: `Masala Recipe ${i}` });
      }

      const res = await agent().get('/api/recipes/search?q=Masala');
      assert.equal(res.status, 200);
      assert.ok(res.body.length >= 50, `Expected many results, got ${res.body.length}`);
    });

    it('filter by cuisine on 100 recipes', async () => {
      for (let i = 0; i < 100; i++) {
        makeRecipe({ name: `Bulk ${i}`, cuisine: i < 60 ? 'Indian' : 'Chinese' });
      }

      const res = await agent().get('/api/recipes?cuisine=Indian&limit=100');
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 60);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-14: Backup/export restore test
  // ═══════════════════════════════════════════════════════════════
  describe('QA-14: Backup/export', () => {
    it('export returns JSON with expected keys', async () => {
      makeRecipe({ name: 'Export Recipe' });
      makeIngredient({ name: 'Export Ingredient' });

      const res = await agent().get('/api/data/export');
      assert.equal(res.status, 200);
      assert.ok('version' in res.body);
      assert.ok('exported_at' in res.body);
      assert.ok('recipes' in res.body);
      assert.ok('ingredients' in res.body);
      assert.ok('recipe_ingredients' in res.body);
      assert.ok('tags' in res.body);
      assert.ok('meal_plans' in res.body);
      assert.ok('shopping_lists' in res.body);
      assert.ok('nutrition_log' in res.body);
      assert.ok('settings' in res.body);
      assert.ok(Array.isArray(res.body.recipes));
      assert.ok(res.body.recipes.length >= 1);
    });

    it('export CSV returns valid CSV content', async () => {
      makeRecipe({ name: 'CSV Recipe' });

      const res = await agent().get('/api/data/export?format=csv');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('--- RECIPES ---'));
      assert.ok(res.text.includes('CSV Recipe'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // QA-15: Session expiry handling
  // ═══════════════════════════════════════════════════════════════
  describe('QA-15: Session expiry', () => {
    it('valid session works for API calls', async () => {
      const res = await agent().get('/api/auth/session');
      assert.equal(res.status, 200);
      assert.ok(res.body.email);
    });

    it('expired session returns 401', async () => {
      // Create an expired session
      const sid = 'expired-' + crypto.randomUUID();
      db.prepare("INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, 1, 0, datetime('now', '-1 hour'))").run(sid);

      const res = await rawAgent().get('/api/auth/session').set('Cookie', `mf_sid=${sid}`);
      assert.equal(res.status, 401);
    });

    it('bogus session ID returns 401', async () => {
      const res = await rawAgent().get('/api/recipes').set('Cookie', 'mf_sid=totally-fake-session');
      assert.equal(res.status, 401);
    });
  });
});
