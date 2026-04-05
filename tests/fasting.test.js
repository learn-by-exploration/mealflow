const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  setup, cleanDb, teardown, agent,
  makeHousehold, makePerson, makeFestival, addFastingRule,
  linkPersonFestival, makeRecipe, makeIngredient, addRecipeIngredient,
  makeMealPlan, makeMealPlanItem, assignPersonToItem,
} = require('./helpers');

describe('Fasting Compliance', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('GET /api/meals/:date/compliance — returns compliant when no fasting', async () => {
    const hh = makeHousehold({ created_by: 1 });
    makePerson(hh.id, { name: 'NonFaster' });
    const res = await agent().get('/api/meals/2026-04-10/compliance');
    assert.equal(res.status, 200);
    assert.equal(res.body.compliant, true);
    assert.equal(res.body.violations.length, 0);
  });

  it('GET /api/meals/:date/compliance — detects violation (grain during Navratri)', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'Devotee' });

    // Create a fasting festival active on 2026-04-10
    const fest = makeFestival({
      name: 'Navratri Test',
      is_fasting: 1,
      fasting_type: 'specific_foods',
      date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-10' } }),
      duration_days: 9,
    });
    addFastingRule(fest.id, { rule_type: 'deny', category: 'grains', notes: 'No grains' });
    linkPersonFestival(person.id, fest.id);

    // Create meal with a grain ingredient
    const wheat = makeIngredient({ name: 'Wheat Flour', category: 'grains' });
    const recipe = makeRecipe({ name: 'Chapati' });
    addRecipeIngredient(recipe.id, wheat.id);

    const plan = makeMealPlan({ date: '2026-04-10', meal_type: 'lunch' });
    const item = makeMealPlanItem(plan.id, recipe.id);
    assignPersonToItem(item.id, person.id);

    const res = await agent().get('/api/meals/2026-04-10/compliance');
    assert.equal(res.status, 200);
    assert.equal(res.body.compliant, false);
    assert.ok(res.body.violations.length > 0);
    assert.equal(res.body.violations[0].person_name, 'Devotee');
  });

  it('GET /api/meals/:date/compliance — passes with allowed foods (sabudana during Navratri)', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'Devotee' });

    const fest = makeFestival({
      name: 'Navratri Allow',
      is_fasting: 1,
      fasting_type: 'specific_foods',
      date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-10' } }),
      duration_days: 9,
    });
    addFastingRule(fest.id, { rule_type: 'deny', category: 'grains', notes: 'No grains' });
    addFastingRule(fest.id, { rule_type: 'allow', ingredient_name: 'Sabudana', notes: 'Tapioca sago' });
    linkPersonFestival(person.id, fest.id);

    // Use an allowed ingredient
    const sabudana = makeIngredient({ name: 'Sabudana', category: 'grains' });
    const recipe = makeRecipe({ name: 'Sabudana Khichdi' });
    addRecipeIngredient(recipe.id, sabudana.id);

    const plan = makeMealPlan({ date: '2026-04-10', meal_type: 'lunch' });
    const item = makeMealPlanItem(plan.id, recipe.id);
    assignPersonToItem(item.id, person.id);

    const res = await agent().get('/api/meals/2026-04-10/compliance');
    assert.equal(res.status, 200);
    assert.equal(res.body.compliant, true);
  });

  it('Compliance checks only fasting persons (non-fasting person eating grain = ok)', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const nonFaster = makePerson(hh.id, { name: 'NonFaster' });
    // NonFaster is NOT linked to any festival

    const wheat = makeIngredient({ name: 'Rice', category: 'grains' });
    const recipe = makeRecipe({ name: 'Plain Rice' });
    addRecipeIngredient(recipe.id, wheat.id);

    const plan = makeMealPlan({ date: '2026-04-10', meal_type: 'lunch' });
    const item = makeMealPlanItem(plan.id, recipe.id);
    assignPersonToItem(item.id, nonFaster.id);

    const res = await agent().get('/api/meals/2026-04-10/compliance');
    assert.equal(res.status, 200);
    assert.equal(res.body.compliant, true);
  });

  it('Multi-person fasting (person A fasts, person B does not)', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const faster = makePerson(hh.id, { name: 'Faster' });
    const nonFaster = makePerson(hh.id, { name: 'NonFaster' });

    const fest = makeFestival({
      name: 'Multi Fest',
      is_fasting: 1,
      fasting_type: 'specific_foods',
      date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-10' } }),
      duration_days: 1,
    });
    addFastingRule(fest.id, { rule_type: 'deny', category: 'grains' });
    linkPersonFestival(faster.id, fest.id);
    // nonFaster NOT linked

    const wheat = makeIngredient({ name: 'Wheat Multi', category: 'grains' });
    const recipe = makeRecipe({ name: 'Bread Multi' });
    addRecipeIngredient(recipe.id, wheat.id);

    const plan = makeMealPlan({ date: '2026-04-10', meal_type: 'dinner' });
    const item = makeMealPlanItem(plan.id, recipe.id);
    // Both eat the meal
    assignPersonToItem(item.id, faster.id);
    assignPersonToItem(item.id, nonFaster.id);

    const res = await agent().get('/api/meals/2026-04-10/compliance');
    assert.equal(res.status, 200);
    assert.equal(res.body.compliant, false);
    // Only faster should have violations
    const violationNames = res.body.violations.map(v => v.person_name);
    assert.ok(violationNames.includes('Faster'));
    assert.ok(!violationNames.includes('NonFaster'));
  });

  it('Allow rules work correctly', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'AllowTest' });

    const fest = makeFestival({
      name: 'Allow Fest',
      is_fasting: 1,
      date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-10' } }),
    });
    addFastingRule(fest.id, { rule_type: 'deny', category: 'grains' });
    addFastingRule(fest.id, { rule_type: 'allow', category: 'dairy' });
    linkPersonFestival(person.id, fest.id);

    const milk = makeIngredient({ name: 'Milk Allow', category: 'dairy' });
    const recipe = makeRecipe({ name: 'Milk Dish' });
    addRecipeIngredient(recipe.id, milk.id);

    const plan = makeMealPlan({ date: '2026-04-10', meal_type: 'breakfast' });
    const item = makeMealPlanItem(plan.id, recipe.id);
    assignPersonToItem(item.id, person.id);

    const res = await agent().get('/api/meals/2026-04-10/compliance');
    assert.equal(res.status, 200);
    assert.equal(res.body.compliant, true);
  });

  it('Deny rules work correctly', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'DenyTest' });

    const fest = makeFestival({
      name: 'Deny Fest',
      is_fasting: 1,
      date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-10' } }),
    });
    addFastingRule(fest.id, { rule_type: 'deny', ingredient_name: 'Onion Deny' });
    linkPersonFestival(person.id, fest.id);

    const onion = makeIngredient({ name: 'Onion Deny', category: 'vegetables' });
    const recipe = makeRecipe({ name: 'Onion Soup' });
    addRecipeIngredient(recipe.id, onion.id);

    const plan = makeMealPlan({ date: '2026-04-10', meal_type: 'dinner' });
    const item = makeMealPlanItem(plan.id, recipe.id);
    assignPersonToItem(item.id, person.id);

    const res = await agent().get('/api/meals/2026-04-10/compliance');
    assert.equal(res.status, 200);
    assert.equal(res.body.compliant, false);
    assert.ok(res.body.violations.some(v => v.ingredient_name === 'Onion Deny'));
  });

  it('Combined allow+deny rules', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'ComboTest' });

    const fest = makeFestival({
      name: 'Combo Fest',
      is_fasting: 1,
      date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-10' } }),
    });
    // Deny all grains but allow Kuttu Atta specifically
    addFastingRule(fest.id, { rule_type: 'deny', category: 'grains' });
    addFastingRule(fest.id, { rule_type: 'allow', ingredient_name: 'Kuttu Atta Combo' });
    linkPersonFestival(person.id, fest.id);

    // Recipe with allowed grain + denied vegetable
    const kuttu = makeIngredient({ name: 'Kuttu Atta Combo', category: 'grains' });
    const recipe = makeRecipe({ name: 'Kuttu Roti' });
    addRecipeIngredient(recipe.id, kuttu.id);

    const plan = makeMealPlan({ date: '2026-04-10', meal_type: 'lunch' });
    const item = makeMealPlanItem(plan.id, recipe.id);
    assignPersonToItem(item.id, person.id);

    // Should pass — kuttu is grain but specifically allowed
    const res = await agent().get('/api/meals/2026-04-10/compliance');
    assert.equal(res.status, 200);
    assert.equal(res.body.compliant, true);
  });
});
