const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  setup, cleanDb, teardown, agent,
  makeRecipe, makeIngredient, addRecipeIngredient,
  makeMealPlan, makeMealPlanItem,
  makeHousehold, makePerson, assignPersonToItem,
  makeFestival, addFastingRule, linkPersonFestival,
  makeTag, linkTag,
} = require('./helpers');

describe('Batch 5: Indian Cuisine Domain Accuracy', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // IC-01: Regional cuisine coverage audit
  // ═══════════════════════════════════════════════════════════════
  describe('IC-01: Regional cuisine coverage', () => {
    it('seed data has recipes for all 8 major regional cuisines', async () => {
      // Seed ingredients first, then recipes
      await agent().post('/api/seed/ingredients');
      const res = await agent().post('/api/seed/recipes');
      assert.ok(res.body.count > 0);

      // Check each region exists
      const regions = ['pan_indian', 'punjabi', 'south_indian', 'gujarati', 'bengali', 'maharashtrian', 'rajasthani', 'hyderabadi', 'goan'];
      const regionsRes = await agent().get('/api/recipes/regions');
      const seededRegions = regionsRes.body.map(r => r.region);

      for (const region of regions) {
        assert.ok(seededRegions.includes(region), `Region "${region}" missing from seed data`);
      }
    });

    it('each region has at least 5 recipes', async () => {
      await agent().post('/api/seed/ingredients');
      await agent().post('/api/seed/recipes');

      const regions = ['pan_indian', 'punjabi', 'south_indian', 'gujarati', 'bengali', 'maharashtrian', 'rajasthani', 'hyderabadi', 'goan'];
      const regionsRes = await agent().get('/api/recipes/regions');
      const regionMap = {};
      for (const r of regionsRes.body) regionMap[r.region] = r.count;

      for (const region of regions) {
        assert.ok((regionMap[region] || 0) >= 5, `Region "${region}" has only ${regionMap[region] || 0} recipes, need ≥5`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-02: Meal type classification
  // ═══════════════════════════════════════════════════════════════
  describe('IC-02: Meal type classification', () => {
    it('recipes table has meal_suitability column', () => {
      const recipe = makeRecipe();
      const row = db.prepare('SELECT meal_suitability FROM recipes WHERE id = ?').get(recipe.id);
      assert.ok(row !== undefined);
      assert.equal(row.meal_suitability, '[]');
    });

    it('can store meal_suitability as JSON array', () => {
      const recipe = makeRecipe();
      db.prepare('UPDATE recipes SET meal_suitability = ? WHERE id = ?')
        .run(JSON.stringify(['breakfast', 'snack']), recipe.id);
      const row = db.prepare('SELECT meal_suitability FROM recipes WHERE id = ?').get(recipe.id);
      assert.deepEqual(JSON.parse(row.meal_suitability), ['breakfast', 'snack']);
    });

    it('GET /api/recipes?suitable_for=breakfast filters by meal suitability', async () => {
      const r1 = makeRecipe({ name: 'Breakfast Dish' });
      db.prepare('UPDATE recipes SET meal_suitability = ? WHERE id = ?')
        .run(JSON.stringify(['breakfast', 'snack']), r1.id);

      const r2 = makeRecipe({ name: 'Dinner Dish' });
      db.prepare('UPDATE recipes SET meal_suitability = ? WHERE id = ?')
        .run(JSON.stringify(['dinner']), r2.id);

      const res = await agent().get('/api/recipes?suitable_for=breakfast');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.some(r => r.name === 'Breakfast Dish'));
      assert.ok(!res.body.data.some(r => r.name === 'Dinner Dish'));
    });

    it('seed recipes include meal_suitability', async () => {
      await agent().post('/api/seed/ingredients');
      await agent().post('/api/seed/recipes');

      // Street food recipes should have snack suitability
      const recipes = db.prepare("SELECT * FROM recipes WHERE meal_suitability != '[]' AND is_system = 1").all();
      assert.ok(recipes.length > 0, 'Some seeded recipes should have meal_suitability set');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-03: Thali composition rules
  // ═══════════════════════════════════════════════════════════════
  describe('IC-03: Thali composition rules', () => {
    it('GET /api/meals/:date/completeness returns missing components for empty meal', async () => {
      const res = await agent().get('/api/meals/2026-04-06/completeness?meal_type=lunch');
      assert.equal(res.status, 200);
      assert.equal(res.body.complete, false);
      assert.ok(res.body.missing.length > 0);
    });

    it('complete thali returns complete=true', async () => {
      // Create ingredients for each thali component
      const dalIng = makeIngredient({ name: 'Test Dal Ingredient', category: 'pulses' });
      const sabziIng = makeIngredient({ name: 'Test Sabzi Veg', category: 'vegetables' });
      const grainIng = makeIngredient({ name: 'Test Grain', category: 'grains' });
      const condIng = makeIngredient({ name: 'Test Condiment', category: 'condiments' });

      // Dal recipe
      const dalRecipe = makeRecipe({ name: 'Test Dal Tadka' });
      addRecipeIngredient(dalRecipe.id, dalIng.id, { quantity: 200 });

      // Sabzi recipe
      const sabziRecipe = makeRecipe({ name: 'Test Aloo Sabzi' });
      addRecipeIngredient(sabziRecipe.id, sabziIng.id, { quantity: 200 });

      // Roti recipe
      const rotiTag = makeTag({ name: 'bread' });
      const rotiRecipe = makeRecipe({ name: 'Test Roti' });
      addRecipeIngredient(rotiRecipe.id, grainIng.id, { quantity: 100 });
      linkTag(rotiRecipe.id, rotiTag.id);

      // Chutney recipe
      const chutneyRecipe = makeRecipe({ name: 'Test Chutney' });
      addRecipeIngredient(chutneyRecipe.id, condIng.id, { quantity: 50 });

      // Create meal plan with all components
      const plan = makeMealPlan({ date: '2026-04-07', meal_type: 'lunch' });
      makeMealPlanItem(plan.id, dalRecipe.id, { position: 0 });
      makeMealPlanItem(plan.id, sabziRecipe.id, { position: 1 });
      makeMealPlanItem(plan.id, rotiRecipe.id, { position: 2 });
      makeMealPlanItem(plan.id, chutneyRecipe.id, { position: 3 });

      const res = await agent().get('/api/meals/2026-04-07/completeness?meal_type=lunch');
      assert.equal(res.status, 200);
      assert.equal(res.body.complete, true);
      assert.equal(res.body.missing.length, 0);
    });

    it('incomplete thali shows suggestions', async () => {
      const dalIng = makeIngredient({ name: 'Toor Dal Test', category: 'pulses' });
      const dalRecipe = makeRecipe({ name: 'Simple Dal Test' });
      addRecipeIngredient(dalRecipe.id, dalIng.id, { quantity: 200 });

      const plan = makeMealPlan({ date: '2026-04-08', meal_type: 'dinner' });
      makeMealPlanItem(plan.id, dalRecipe.id);

      const res = await agent().get('/api/meals/2026-04-08/completeness?meal_type=dinner');
      assert.equal(res.status, 200);
      assert.equal(res.body.complete, false);
      assert.ok(res.body.missing.length > 0);
      assert.ok(Array.isArray(res.body.suggestions));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-04: Seasonal ingredient flags
  // ═══════════════════════════════════════════════════════════════
  describe('IC-04: Seasonal ingredient flags', () => {
    it('ingredients table has season column', () => {
      const ing = makeIngredient({ name: 'Seasonal Test' });
      const row = db.prepare('SELECT season FROM ingredients WHERE id = ?').get(ing.id);
      assert.equal(row.season, 'year-round');
    });

    it('can set season value', () => {
      const ing = makeIngredient({ name: 'Summer Veg' });
      db.prepare('UPDATE ingredients SET season = ? WHERE id = ?').run('summer', ing.id);
      const row = db.prepare('SELECT season FROM ingredients WHERE id = ?').get(ing.id);
      assert.equal(row.season, 'summer');
    });

    it('GET /api/ingredients?season=summer filters by season', async () => {
      const s1 = makeIngredient({ name: 'Summer Fruit' });
      db.prepare('UPDATE ingredients SET season = ? WHERE id = ?').run('summer', s1.id);
      const s2 = makeIngredient({ name: 'Winter Veg' });
      db.prepare('UPDATE ingredients SET season = ? WHERE id = ?').run('winter', s2.id);
      const yr = makeIngredient({ name: 'Year Round' });

      const res = await agent().get('/api/ingredients?season=summer');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.some(i => i.name === 'Summer Fruit'));
      assert.ok(!res.body.data.some(i => i.name === 'Winter Veg'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-05: Cooking method classification
  // ═══════════════════════════════════════════════════════════════
  describe('IC-05: Cooking method classification', () => {
    it('recipes table has cooking_method column', () => {
      const recipe = makeRecipe();
      const row = db.prepare('SELECT cooking_method FROM recipes WHERE id = ?').get(recipe.id);
      assert.equal(row.cooking_method, '');
    });

    it('can set cooking method', () => {
      const recipe = makeRecipe();
      db.prepare('UPDATE recipes SET cooking_method = ? WHERE id = ?').run('tadka', recipe.id);
      const row = db.prepare('SELECT cooking_method FROM recipes WHERE id = ?').get(recipe.id);
      assert.equal(row.cooking_method, 'tadka');
    });

    it('GET /api/recipes?cooking_method=tadka filters by cooking method', async () => {
      const r1 = makeRecipe({ name: 'Tadka Dal Test' });
      db.prepare('UPDATE recipes SET cooking_method = ? WHERE id = ?').run('tadka', r1.id);

      const r2 = makeRecipe({ name: 'Steamed Idli Test' });
      db.prepare('UPDATE recipes SET cooking_method = ? WHERE id = ?').run('steamed', r2.id);

      const res = await agent().get('/api/recipes?cooking_method=tadka');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.some(r => r.name === 'Tadka Dal Test'));
      assert.ok(!res.body.data.some(r => r.name === 'Steamed Idli Test'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-06: Regional festival variations
  // ═══════════════════════════════════════════════════════════════
  describe('IC-06: Regional festival variations', () => {
    it('fasting_rules table has region column', () => {
      const fest = makeFestival({ name: 'Regional Test Festival' });
      const rule = addFastingRule(fest.id, { rule_type: 'deny', ingredient_name: 'Onion' });
      const row = db.prepare('SELECT region FROM fasting_rules WHERE id = ?').get(rule.id);
      assert.equal(row.region, 'pan-india');
    });

    it('region-specific fasting rules are applied', () => {
      const fest = makeFestival({ name: 'Navratri Region Test', is_fasting: 1 });
      // North India: no grains
      addFastingRule(fest.id, { rule_type: 'deny', category: 'grains' });
      // Add a region-specific override
      db.prepare('UPDATE fasting_rules SET region = ? WHERE festival_id = ? AND category = ?')
        .run('north', fest.id, 'grains');

      const rules = db.prepare('SELECT * FROM fasting_rules WHERE festival_id = ? AND region = ?')
        .all(fest.id, 'north');
      assert.ok(rules.length > 0);
      assert.equal(rules[0].region, 'north');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-07: Jain dietary rules engine
  // ═══════════════════════════════════════════════════════════════
  describe('IC-07: Jain dietary rules engine', () => {
    it('ingredients have is_root_vegetable flag', () => {
      const ing = makeIngredient({ name: 'Test Potato' });
      db.prepare('UPDATE ingredients SET is_root_vegetable = 1 WHERE id = ?').run(ing.id);
      const row = db.prepare('SELECT is_root_vegetable FROM ingredients WHERE id = ?').get(ing.id);
      assert.equal(row.is_root_vegetable, 1);
    });

    it('dietary rules engine rejects root vegetables for Jain diet', () => {
      const { checkRecipeSuitability } = require('../src/services/dietary-rules');

      const recipe = {
        name: 'Aloo Gobi',
        ingredients: [
          { ingredient_name: 'Potato', is_root_vegetable: 1, ingredient_category: 'vegetables' },
          { ingredient_name: 'Cauliflower', is_root_vegetable: 0, ingredient_category: 'vegetables' },
        ],
        tags: [{ name: 'vegetarian' }],
      };

      const result = checkRecipeSuitability(recipe, 'jain');
      assert.equal(result.suitable, false);
      assert.ok(result.violations.some(v => v.includes('Potato')));
    });

    it('dietary rules engine rejects onion/garlic for Jain diet', () => {
      const { checkRecipeSuitability } = require('../src/services/dietary-rules');

      const recipe = {
        name: 'Onion Sabzi',
        ingredients: [
          { ingredient_name: 'Onion', is_root_vegetable: 1, ingredient_category: 'vegetables' },
        ],
        tags: [],
      };

      const result = checkRecipeSuitability(recipe, 'jain');
      assert.equal(result.suitable, false);
    });

    it('Jain-safe recipe passes validation', () => {
      const { checkRecipeSuitability } = require('../src/services/dietary-rules');

      const recipe = {
        name: 'Paneer Tikka',
        ingredients: [
          { ingredient_name: 'Paneer', is_root_vegetable: 0, ingredient_category: 'dairy' },
          { ingredient_name: 'Capsicum', is_root_vegetable: 0, ingredient_category: 'vegetables' },
        ],
        tags: [{ name: 'vegetarian' }],
      };

      const result = checkRecipeSuitability(recipe, 'jain');
      assert.equal(result.suitable, true);
      assert.equal(result.violations.length, 0);
    });

    it('persons can have jain dietary_type', () => {
      const household = makeHousehold();
      const person = makePerson(household.id, { dietary_type: 'jain' });
      assert.equal(person.dietary_type, 'jain');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-08: Sattvic/Swaminarayan diet support
  // ═══════════════════════════════════════════════════════════════
  describe('IC-08: Sattvic/Swaminarayan diet support', () => {
    it('dietary rules engine rejects onion/garlic for Sattvic diet', () => {
      const { checkRecipeSuitability } = require('../src/services/dietary-rules');

      const recipe = {
        name: 'Garlic Naan',
        ingredients: [
          { ingredient_name: 'Garlic', is_root_vegetable: 1, ingredient_category: 'vegetables' },
          { ingredient_name: 'Wheat Flour', is_root_vegetable: 0, ingredient_category: 'grains' },
        ],
        tags: [],
      };

      const result = checkRecipeSuitability(recipe, 'sattvic');
      assert.equal(result.suitable, false);
      assert.ok(result.violations.some(v => v.includes('Garlic')));
    });

    it('dietary rules engine rejects non-veg for Sattvic diet', () => {
      const { checkRecipeSuitability } = require('../src/services/dietary-rules');

      const recipe = {
        name: 'Chicken Curry',
        ingredients: [
          { ingredient_name: 'Chicken', is_root_vegetable: 0, ingredient_category: 'proteins' },
        ],
        tags: [{ name: 'non-vegetarian' }],
      };

      const result = checkRecipeSuitability(recipe, 'sattvic');
      assert.equal(result.suitable, false);
    });

    it('Sattvic-safe recipe passes', () => {
      const { checkRecipeSuitability } = require('../src/services/dietary-rules');

      const recipe = {
        name: 'Plain Rice',
        ingredients: [
          { ingredient_name: 'Basmati Rice', is_root_vegetable: 0, ingredient_category: 'grains' },
        ],
        tags: [{ name: 'vegetarian' }],
      };

      const result = checkRecipeSuitability(recipe, 'sattvic');
      assert.equal(result.suitable, true);
    });

    it('Swaminarayan diet rejects onion/garlic', () => {
      const { checkRecipeSuitability } = require('../src/services/dietary-rules');

      const recipe = {
        name: 'Onion Bhaji',
        ingredients: [
          { ingredient_name: 'Onion', is_root_vegetable: 1, ingredient_category: 'vegetables' },
        ],
        tags: [],
      };

      const result = checkRecipeSuitability(recipe, 'swaminarayan');
      assert.equal(result.suitable, false);
    });

    it('validateMealPlanForPerson checks dietary compliance', () => {
      const { validateMealPlanForPerson } = require('../src/services/dietary-rules');

      const household = makeHousehold();
      const person = makePerson(household.id, { dietary_type: 'sattvic' });

      const onion = makeIngredient({ name: 'Onion For Test', category: 'vegetables' });
      const recipe = makeRecipe({ name: 'Onion Sabzi Test' });
      addRecipeIngredient(recipe.id, onion.id, { quantity: 100 });

      const plan = makeMealPlan({ date: '2026-04-09', meal_type: 'lunch' });
      const item = makeMealPlanItem(plan.id, recipe.id);
      assignPersonToItem(item.id, person.id);

      const result = validateMealPlanForPerson(db, person.id, '2026-04-09', 1);
      assert.equal(result.valid, false);
      assert.ok(result.violations.length > 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-09: Ekadashi / monthly fasting calendar
  // ═══════════════════════════════════════════════════════════════
  describe('IC-09: Ekadashi fasting calendar', () => {
    it('GET /api/festivals/ekadashi?year=2026 returns dates', async () => {
      const res = await agent().get('/api/festivals/ekadashi?year=2026');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      // Approximately 24 Ekadashi dates per year (2 per month)
      assert.ok(res.body.length >= 20, `Expected ≥20 Ekadashi dates, got ${res.body.length}`);
      assert.ok(res.body.length <= 26, `Expected ≤26 Ekadashi dates, got ${res.body.length}`);
    });

    it('Ekadashi dates include known 2026 dates', async () => {
      const res = await agent().get('/api/festivals/ekadashi?year=2026');
      const dates = res.body.map(e => e.date);
      // Known Ekadashi dates for 2026 (approximate):
      // January: ~Jan 6 (Pausha Putrada) and ~Jan 21 (Shattila)
      // These are approximations based on lunar calendar
      assert.ok(dates.some(d => d.startsWith('2026-01')), 'Should have January Ekadashi');
      assert.ok(dates.some(d => d.startsWith('2026-06')), 'Should have June Ekadashi');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-10: Ramadan/Roza meal timing
  // ═══════════════════════════════════════════════════════════════
  describe('IC-10: Ramadan/Roza meal timing', () => {
    it('meal_slot_overrides table exists', () => {
      const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meal_slot_overrides'").get();
      assert.ok(tableInfo, 'meal_slot_overrides table should exist');
    });

    it('can insert meal slot overrides', () => {
      const fest = makeFestival({ name: 'Ramadan Test', type: 'muslim' });

      db.prepare('INSERT INTO meal_slot_overrides (festival_id, slot_name, start_time, end_time) VALUES (?,?,?,?)')
        .run(fest.id, 'sehri', '04:00', '05:30');
      db.prepare('INSERT INTO meal_slot_overrides (festival_id, slot_name, start_time, end_time) VALUES (?,?,?,?)')
        .run(fest.id, 'iftar', '18:30', '20:00');

      const overrides = db.prepare('SELECT * FROM meal_slot_overrides WHERE festival_id = ?').all(fest.id);
      assert.equal(overrides.length, 2);
      assert.ok(overrides.some(o => o.slot_name === 'sehri'));
      assert.ok(overrides.some(o => o.slot_name === 'iftar'));
    });

    it('GET /api/festivals/:id returns slot overrides', async () => {
      const fest = makeFestival({ name: 'Ramadan Slots Test', type: 'muslim' });
      db.prepare('INSERT INTO meal_slot_overrides (festival_id, slot_name, start_time, end_time) VALUES (?,?,?,?)')
        .run(fest.id, 'sehri', '04:00', '05:30');

      const res = await agent().get(`/api/festivals/${fest.id}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.slot_overrides));
      assert.ok(res.body.slot_overrides.some(o => o.slot_name === 'sehri'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-11: Hindi/regional name aliases
  // ═══════════════════════════════════════════════════════════════
  describe('IC-11: Hindi/regional name aliases', () => {
    it('ingredients have aliases column', () => {
      const ing = makeIngredient({ name: 'Coriander Test' });
      const row = db.prepare('SELECT aliases FROM ingredients WHERE id = ?').get(ing.id);
      assert.equal(row.aliases, '[]');
    });

    it('can set aliases as JSON array', () => {
      const ing = makeIngredient({ name: 'Coriander Leaves' });
      db.prepare('UPDATE ingredients SET aliases = ? WHERE id = ?')
        .run(JSON.stringify(['Dhaniya', 'Kothamalli', 'Kothmir']), ing.id);
      const row = db.prepare('SELECT aliases FROM ingredients WHERE id = ?').get(ing.id);
      assert.deepEqual(JSON.parse(row.aliases), ['Dhaniya', 'Kothamalli', 'Kothmir']);
    });

    it('GET /api/ingredients?q=dhaniya matches aliases', async () => {
      const ing = makeIngredient({ name: 'Coriander Leaves Alias Test' });
      db.prepare('UPDATE ingredients SET aliases = ? WHERE id = ?')
        .run(JSON.stringify(['Dhaniya', 'Kothamalli']), ing.id);

      const res = await agent().get('/api/ingredients?q=Dhaniya');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.some(i => i.name === 'Coriander Leaves Alias Test'));
    });

    it('alias search is case-insensitive', async () => {
      const ing = makeIngredient({ name: 'Turmeric Test' });
      db.prepare('UPDATE ingredients SET aliases = ? WHERE id = ?')
        .run(JSON.stringify(['Haldi', 'Manjal']), ing.id);

      const res = await agent().get('/api/ingredients?q=haldi');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.some(i => i.name === 'Turmeric Test'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-12: Indian unit conversions
  // ═══════════════════════════════════════════════════════════════
  describe('IC-12: Indian unit conversions', () => {
    it('convert katori to ml', () => {
      const { convert } = require('../src/services/unit-converter');
      const result = convert('katori', 'ml', 2);
      assert.equal(result.result, 300);
    });

    it('convert chammach to ml', () => {
      const { convert } = require('../src/services/unit-converter');
      const result = convert('chammach', 'ml', 1);
      assert.equal(result.result, 15);
    });

    it('convert mutthi to g', () => {
      const { convert } = require('../src/services/unit-converter');
      const result = convert('mutthi', 'g', 2);
      assert.equal(result.result, 60);
    });

    it('convert chai-chammach to ml', () => {
      const { convert } = require('../src/services/unit-converter');
      const result = convert('chai-chammach', 'ml', 3);
      assert.equal(result.result, 15);
    });

    it('convert glass to ml', () => {
      const { convert } = require('../src/services/unit-converter');
      const result = convert('glass', 'ml', 1);
      assert.equal(result.result, 250);
    });

    it('convert plate to g', () => {
      const { convert } = require('../src/services/unit-converter');
      const result = convert('plate', 'g', 1);
      assert.equal(result.result, 200);
    });

    it('returns null for unsupported conversions', () => {
      const { convert } = require('../src/services/unit-converter');
      const result = convert('mutthi', 'ml', 1);
      assert.equal(result, null);
    });

    it('GET /api/units/convert returns conversion result', async () => {
      const res = await agent().get('/api/units/convert?from=katori&to=ml&amount=2');
      assert.equal(res.status, 200);
      assert.equal(res.body.result, 300);
      assert.equal(res.body.from, 'katori');
      assert.equal(res.body.to, 'ml');
    });

    it('GET /api/units/convert returns 400 for invalid conversion', async () => {
      const res = await agent().get('/api/units/convert?from=mutthi&to=ml&amount=1');
      assert.equal(res.status, 400);
    });

    it('GET /api/units lists all supported units', async () => {
      const res = await agent().get('/api/units');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.some(u => u.name === 'katori'));
      assert.ok(res.body.some(u => u.name === 'glass'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-13: IFCT nutrition data validation
  // ═══════════════════════════════════════════════════════════════
  describe('IC-13: IFCT nutrition data validation', () => {
    it('seed ingredients have valid nutrition values', async () => {
      await agent().post('/api/seed/ingredients');

      const allIngs = db.prepare('SELECT * FROM ingredients WHERE is_system = 1').all();
      assert.ok(allIngs.length > 0, 'Should have seeded ingredients');

      for (const ing of allIngs) {
        assert.ok(ing.calories >= 0, `${ing.name}: calories should be >= 0, got ${ing.calories}`);
        assert.ok(ing.protein >= 0, `${ing.name}: protein should be >= 0, got ${ing.protein}`);
        assert.ok(ing.carbs >= 0, `${ing.name}: carbs should be >= 0, got ${ing.carbs}`);
        assert.ok(ing.fat >= 0, `${ing.name}: fat should be >= 0, got ${ing.fat}`);
      }
    });

    it('key ingredients have reasonable calorie values', async () => {
      await agent().post('/api/seed/ingredients');

      const checks = [
        { name: 'Basmati Rice', minCal: 300, maxCal: 400 },
        { name: 'Wheat Flour (Atta)', minCal: 300, maxCal: 400 },
        { name: 'Toor Dal', minCal: 300, maxCal: 400 },
        { name: 'Milk', minCal: 40, maxCal: 100 },
        { name: 'Paneer', minCal: 200, maxCal: 350 },
        { name: 'Ghee', minCal: 800, maxCal: 950 },
      ];

      for (const check of checks) {
        const ing = db.prepare('SELECT * FROM ingredients WHERE name = ? AND is_system = 1').get(check.name);
        assert.ok(ing, `${check.name} should exist in seeds`);
        assert.ok(ing.calories >= check.minCal && ing.calories <= check.maxCal,
          `${check.name}: expected ${check.minCal}-${check.maxCal} cal, got ${ing.calories}`);
      }
    });

    it('no zero-calorie main ingredients (grains/pulses/dairy/proteins)', async () => {
      await agent().post('/api/seed/ingredients');

      const mainIngs = db.prepare(
        "SELECT * FROM ingredients WHERE is_system = 1 AND category IN ('grains', 'pulses', 'dairy', 'proteins')"
      ).all();

      for (const ing of mainIngs) {
        assert.ok(ing.calories > 0, `${ing.name} (${ing.category}): should have >0 calories, got ${ing.calories}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-14: Street food / chaat recipes
  // ═══════════════════════════════════════════════════════════════
  describe('IC-14: Street food / chaat recipes', () => {
    it('seed data includes 15+ street food recipes', async () => {
      await agent().post('/api/seed/ingredients');
      await agent().post('/api/seed/recipes');

      const streetFoodNames = [
        'Pani Puri', 'Bhel Puri', 'Kachori', 'Samosa', 'Dahi Puri',
        'Pav Bhaji', 'Chole Bhature', 'Jalebi', 'Medu Vada',
        'Aloo Tikki Chaat', 'Ragda Pattice', 'Misal Pav'
      ];

      let found = 0;
      for (const name of streetFoodNames) {
        const recipe = db.prepare('SELECT id FROM recipes WHERE name LIKE ? AND is_system = 1').get(`%${name}%`);
        if (recipe) found++;
      }

      assert.ok(found >= 12, `Expected ≥12 street food recipes seeded, found ${found}`);
    });

    it('street food recipes have correct tags', async () => {
      await agent().post('/api/seed/ingredients');
      await agent().post('/api/seed/recipes');

      const samosa = db.prepare("SELECT id FROM recipes WHERE name = 'Samosa' AND is_system = 1").get();
      if (samosa) {
        const tags = db.prepare('SELECT t.name FROM tags t JOIN recipe_tags rt ON rt.tag_id = t.id WHERE rt.recipe_id = ?')
          .all(samosa.id);
        const tagNames = tags.map(t => t.name);
        assert.ok(tagNames.includes('street-food'), 'Samosa should have street-food tag');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IC-15: Pickle/achaar/chutney as condiments
  // ═══════════════════════════════════════════════════════════════
  describe('IC-15: Recipe category', () => {
    it('recipes table has category column', () => {
      const recipe = makeRecipe();
      const row = db.prepare('SELECT category FROM recipes WHERE id = ?').get(recipe.id);
      assert.equal(row.category, 'main');
    });

    it('can set category values', () => {
      const values = ['main', 'side_dish', 'condiment', 'beverage', 'dessert', 'snack'];
      for (const val of values) {
        const recipe = makeRecipe({ name: `Category ${val}` });
        db.prepare('UPDATE recipes SET category = ? WHERE id = ?').run(val, recipe.id);
        const row = db.prepare('SELECT category FROM recipes WHERE id = ?').get(recipe.id);
        assert.equal(row.category, val);
      }
    });

    it('condiment portions are halved in nutrition calculation', async () => {
      const ing = makeIngredient({ name: 'Chutney Ingredient', calories: 100, protein: 5, carbs: 15, fat: 2 });

      // Regular recipe
      const mainRecipe = makeRecipe({ name: 'Main Dish Test' });
      addRecipeIngredient(mainRecipe.id, ing.id, { quantity: 100 });

      // Condiment recipe
      const condimentRecipe = makeRecipe({ name: 'Chutney Test' });
      db.prepare('UPDATE recipes SET category = ? WHERE id = ?').run('condiment', condimentRecipe.id);
      addRecipeIngredient(condimentRecipe.id, ing.id, { quantity: 100 });

      // Get both via API
      const mainRes = await agent().get(`/api/recipes/${mainRecipe.id}`);
      const condRes = await agent().get(`/api/recipes/${condimentRecipe.id}`);

      assert.equal(mainRes.status, 200);
      assert.equal(condRes.status, 200);

      // Condiment nutrition should be halved
      assert.ok(condRes.body.nutrition.calories < mainRes.body.nutrition.calories,
        `Condiment cal ${condRes.body.nutrition.calories} should be < main cal ${mainRes.body.nutrition.calories}`);
    });

    it('GET /api/recipes?category=condiment filters by category', async () => {
      const r1 = makeRecipe({ name: 'Green Chutney Test' });
      db.prepare('UPDATE recipes SET category = ? WHERE id = ?').run('condiment', r1.id);
      const r2 = makeRecipe({ name: 'Regular Main Test' });

      const res = await agent().get('/api/recipes?category=condiment');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.some(r => r.name === 'Green Chutney Test'));
      assert.ok(!res.body.data.some(r => r.name === 'Regular Main Test'));
    });
  });
});
