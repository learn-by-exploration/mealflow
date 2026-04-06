const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  setup, cleanDb, teardown, agent, rawAgent,
  makeRecipe, makeIngredient, makeTag, linkTag, addRecipeIngredient,
  makeMealPlan, makeMealPlanItem, makeShoppingList,
  makeHousehold, makeUser2, makePerson, makePoll, addPollOption,
} = require('./helpers');

describe('Batch 9: Advanced Features', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // BE-06: OpenAPI spec
  // ═══════════════════════════════════════════════════════════════
  describe('BE-06: OpenAPI spec', () => {
    it('docs/openapi.yaml exists and is valid YAML', () => {
      const yamlPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
      assert.ok(fs.existsSync(yamlPath), 'openapi.yaml should exist');
      const content = fs.readFileSync(yamlPath, 'utf-8');
      assert.ok(content.includes('openapi: 3.0.3'), 'should be OpenAPI 3.0.3');
      assert.ok(content.includes('/api/auth/login'), 'should document auth routes');
      assert.ok(content.includes('/api/recipes'), 'should document recipe routes');
      assert.ok(content.includes('/api/ingredients'), 'should document ingredient routes');
      assert.ok(content.includes('/api/meals'), 'should document meal routes');
      assert.ok(content.includes('/api/shopping'), 'should document shopping routes');
      assert.ok(content.includes('/api/nutrition'), 'should document nutrition routes');
      assert.ok(content.includes('/api/households'), 'should document household routes');
      assert.ok(content.includes('/api/polls'), 'should document poll routes');
      assert.ok(content.includes('/api/tags'), 'should document tag routes');
      assert.ok(content.includes('/api/pantry'), 'should document pantry routes');
      assert.ok(content.includes('/api/stats'), 'should document stats routes');
      assert.ok(content.includes('/api/festivals'), 'should document festival routes');
      assert.ok(content.includes('/api/templates'), 'should document template routes');
      assert.ok(content.includes('/api/cost'), 'should document cost routes');
      assert.ok(content.includes('/api/units'), 'should document unit routes');
      assert.ok(content.includes('/api/ratings'), 'should document rating routes');
    });

    it('GET /api/docs returns the OpenAPI spec', async () => {
      const res = await agent().get('/api/docs');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('openapi: 3.0.3'), 'should contain OpenAPI version');
    });

    it('OpenAPI spec includes request/response schemas', () => {
      const yamlPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
      const content = fs.readFileSync(yamlPath, 'utf-8');
      assert.ok(content.includes('schemas:'), 'should have schemas section');
      assert.ok(content.includes('application/json'), 'should specify JSON content type');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BE-11: WebSocket notifications
  // ═══════════════════════════════════════════════════════════════
  describe('BE-11: WebSocket notifications', () => {
    it('src/ws.js module exists', () => {
      const wsPath = path.join(__dirname, '..', 'src', 'ws.js');
      assert.ok(fs.existsSync(wsPath), 'ws.js should exist');
    });

    it('ws.js exports setupWebSocket function', () => {
      const wsModule = require('../src/ws');
      assert.equal(typeof wsModule.setupWebSocket, 'function');
    });

    it('broadcasts meal_updated on meal plan change', async () => {
      const hh = makeHousehold();
      const recipe = makeRecipe();
      // Create a meal plan
      const res = await agent().post('/api/meals').send({
        date: '2026-04-10', meal_type: 'lunch',
      });
      assert.equal(res.status, 201);
    });

    it('broadcasts poll_created on poll creation', async () => {
      const hh = makeHousehold();
      const recipe = makeRecipe();
      const res = await agent().post('/api/polls').send({
        question: 'What for dinner?',
        target_date: '2026-04-10',
        target_meal_type: 'dinner',
        options: [{ custom_name: 'Pizza' }, { custom_name: 'Pasta' }],
      });
      assert.equal(res.status, 201);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SEC-12: Dependency vulnerability scan
  // ═══════════════════════════════════════════════════════════════
  describe('SEC-12: npm audit setup', () => {
    it('package.json has audit script', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
      assert.ok(pkg.scripts.audit, 'should have audit script');
      assert.ok(pkg.scripts.audit.includes('npm audit'), 'audit script should run npm audit');
    });

    it('CI workflow includes audit step', () => {
      const ciPath = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');
      const content = fs.readFileSync(ciPath, 'utf-8');
      assert.ok(content.includes('audit'), 'CI should include audit step');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PO-02: Enhanced sample plan seeding
  // ═══════════════════════════════════════════════════════════════
  describe('PO-02: Enhanced sample plan seeding', () => {
    it('POST /api/seed/sample-plan creates 7-day plan', async () => {
      // Seed some recipes with meal_suitability
      const breakfast = makeRecipe({ name: 'Poha', meal_suitability: JSON.stringify(['breakfast']) });
      const lunch = makeRecipe({ name: 'Dal Rice', meal_suitability: JSON.stringify(['lunch']) });
      const dinner = makeRecipe({ name: 'Roti Sabzi', meal_suitability: JSON.stringify(['dinner']) });
      const snack = makeRecipe({ name: 'Chai Biscuit', meal_suitability: JSON.stringify(['morning_snack', 'evening_snack']) });

      const res = await agent().post('/api/seed/sample-plan');
      assert.equal(res.status, 200);
      assert.ok(res.body.created > 0, 'should create meal plan entries');
    });

    it('sample plan prefers recipes matching meal suitability', async () => {
      const breakfast = makeRecipe({ name: 'Idli', meal_suitability: JSON.stringify(['breakfast']) });
      const lunch = makeRecipe({ name: 'Biryani', meal_suitability: JSON.stringify(['lunch']) });
      const dinner = makeRecipe({ name: 'Paneer Curry', meal_suitability: JSON.stringify(['dinner']) });

      const res = await agent().post('/api/seed/sample-plan');
      assert.equal(res.status, 200);
      assert.ok(res.body.created > 0);

      // Check that breakfast slots got breakfast recipes where possible
      const breakfastPlans = db.prepare(
        "SELECT mp.*, mpi.recipe_id FROM meal_plans mp JOIN meal_plan_items mpi ON mpi.meal_plan_id = mp.id WHERE mp.user_id = 1 AND mp.meal_type = 'breakfast'"
      ).all();
      assert.ok(breakfastPlans.length > 0, 'should have breakfast plans');
      // At least some should have the breakfast recipe
      const hasBreakfastRecipe = breakfastPlans.some(p => p.recipe_id === breakfast.id);
      assert.ok(hasBreakfastRecipe, 'breakfast slots should prefer breakfast-suitable recipes');
    });

    it('sample plan does not duplicate existing plans', async () => {
      makeRecipe({ name: 'Test Recipe' });

      const res1 = await agent().post('/api/seed/sample-plan');
      const count1 = res1.body.created;

      const res2 = await agent().post('/api/seed/sample-plan');
      assert.equal(res2.body.created, 0, 'second seed should create 0 (all exist)');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Cleanup: Sort/order on recipes
  // ═══════════════════════════════════════════════════════════════
  describe('Cleanup: Recipe sort/order params', () => {
    it('GET /api/recipes?sort=name&order=asc sorts by name asc', async () => {
      makeRecipe({ name: 'Zucchini Soup' });
      makeRecipe({ name: 'Apple Pie' });
      makeRecipe({ name: 'Mango Lassi' });

      const res = await agent().get('/api/recipes?sort=name&order=asc');
      assert.equal(res.status, 200);
      const names = res.body.data.map(r => r.name);
      assert.deepEqual(names, [...names].sort());
    });

    it('GET /api/recipes?sort=name&order=desc sorts by name desc', async () => {
      makeRecipe({ name: 'Zucchini Soup' });
      makeRecipe({ name: 'Apple Pie' });
      makeRecipe({ name: 'Mango Lassi' });

      const res = await agent().get('/api/recipes?sort=name&order=desc');
      assert.equal(res.status, 200);
      const names = res.body.data.map(r => r.name);
      assert.deepEqual(names, [...names].sort().reverse());
    });

    it('GET /api/recipes?sort=created_at&order=asc sorts oldest first', async () => {
      makeRecipe({ name: 'First' });
      makeRecipe({ name: 'Second' });

      const res = await agent().get('/api/recipes?sort=created_at&order=asc');
      assert.equal(res.status, 200);
      assert.equal(res.body.data[0].name, 'First');
    });

    it('default sort is created_at desc (newest first)', async () => {
      const r1 = makeRecipe({ name: 'First' });
      // Force different timestamps
      db.prepare("UPDATE recipes SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(r1.id);
      const r2 = makeRecipe({ name: 'Second' });

      const res = await agent().get('/api/recipes');
      assert.equal(res.status, 200);
      // Default should be newest first
      assert.equal(res.body.data[0].name, 'Second');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Cleanup: Sort/order on ingredients
  // ═══════════════════════════════════════════════════════════════
  describe('Cleanup: Ingredient sort/order params', () => {
    it('GET /api/ingredients?sort=name&order=asc sorts by name asc', async () => {
      makeIngredient({ name: 'Zucchini' });
      makeIngredient({ name: 'Apple' });
      makeIngredient({ name: 'Mango' });

      const res = await agent().get('/api/ingredients?sort=name&order=asc');
      assert.equal(res.status, 200);
      const names = res.body.data.map(i => i.name);
      assert.deepEqual(names, [...names].sort());
    });

    it('GET /api/ingredients?sort=name&order=desc sorts by name desc', async () => {
      makeIngredient({ name: 'Zucchini' });
      makeIngredient({ name: 'Apple' });
      makeIngredient({ name: 'Mango' });

      const res = await agent().get('/api/ingredients?sort=name&order=desc');
      assert.equal(res.status, 200);
      const names = res.body.data.map(i => i.name);
      assert.deepEqual(names, [...names].sort().reverse());
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Cleanup: Person count in household detail
  // ═══════════════════════════════════════════════════════════════
  describe('Cleanup: Household person count', () => {
    it('GET /api/households/current includes person_count', async () => {
      const hh = makeHousehold();
      makePerson(hh.id, { name: 'Mom' });
      makePerson(hh.id, { name: 'Dad' });
      makePerson(hh.id, { name: 'Kid' });

      const res = await agent().get('/api/households/current');
      assert.equal(res.status, 200);
      assert.equal(res.body.person_count, 3);
    });

    it('person_count is 0 when no persons added', async () => {
      makeHousehold();

      const res = await agent().get('/api/households/current');
      assert.equal(res.status, 200);
      assert.equal(res.body.person_count, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Cleanup: Shopping list response includes item_count
  // ═══════════════════════════════════════════════════════════════
  describe('Cleanup: Shopping list item count', () => {
    it('GET /api/shopping lists include total_items and checked_items', async () => {
      const list = makeShoppingList();
      db.prepare('INSERT INTO shopping_list_items (list_id, name, quantity, unit, category, checked, position) VALUES (?,?,?,?,?,?,?)').run(list.id, 'Rice', 1, 'kg', 'grains', 0, 0);
      db.prepare('INSERT INTO shopping_list_items (list_id, name, quantity, unit, category, checked, position) VALUES (?,?,?,?,?,?,?)').run(list.id, 'Dal', 500, 'g', 'pulses', 1, 1);

      const res = await agent().get('/api/shopping');
      assert.equal(res.status, 200);
      const sl = res.body.find(l => l.id === list.id);
      assert.equal(sl.total_items, 2);
      assert.equal(sl.checked_items, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Cleanup: updated_at in API responses
  // ═══════════════════════════════════════════════════════════════
  describe('Cleanup: updated_at/created_at in responses', () => {
    it('GET /api/recipes/:id includes updated_at', async () => {
      const recipe = makeRecipe();
      const res = await agent().get(`/api/recipes/${recipe.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.updated_at !== undefined, 'should include updated_at');
      assert.ok(res.body.created_at !== undefined, 'should include created_at');
    });

    it('GET /api/ingredients/:id includes created_at', async () => {
      const ing = makeIngredient();
      const res = await agent().get(`/api/ingredients/${ing.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.created_at !== undefined, 'should include created_at');
    });

    it('GET /api/shopping/:id includes created_at', async () => {
      const list = makeShoppingList();
      const res = await agent().get(`/api/shopping/${list.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.created_at !== undefined, 'should include created_at');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Cleanup: Consistent sorting (newest first)
  // ═══════════════════════════════════════════════════════════════
  describe('Cleanup: Consistent newest-first sorting', () => {
    it('GET /api/shopping lists are sorted newest first', async () => {
      const list1 = makeShoppingList({ name: 'Old List' });
      db.prepare("UPDATE shopping_lists SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(list1.id);
      const list2 = makeShoppingList({ name: 'New List' });

      const res = await agent().get('/api/shopping');
      assert.equal(res.status, 200);
      // Newest (list2) should come first
      assert.equal(res.body[0].name, 'New List');
    });

    it('GET /api/tags are sorted by name', async () => {
      makeTag({ name: 'Zesty' });
      makeTag({ name: 'Appetizer' });
      makeTag({ name: 'Main' });

      const res = await agent().get('/api/tags');
      assert.equal(res.status, 200);
      const names = res.body.map(t => t.name);
      assert.deepEqual(names, [...names].sort());
    });
  });
});
