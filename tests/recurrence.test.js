const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeRecipe, makeMealPlan, makeMealPlanItem } = require('./helpers');

describe('Recurrence', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('POST /api/meals/items/:id/recurrence — creates daily recurrence', async () => {
    const plan = makeMealPlan({ date: '2026-04-06' });
    const recipe = makeRecipe();
    const item = makeMealPlanItem(plan.id, recipe.id);

    const res = await agent().post(`/api/meals/items/${item.id}/recurrence`).send({
      pattern: 'daily',
      start_date: '2026-04-06',
      end_date: '2026-04-12',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.pattern, 'daily');
    assert.equal(res.body.meal_plan_item_id, item.id);
  });

  it('POST /api/meals/items/:id/recurrence — creates specific_days recurrence (MWF)', async () => {
    const plan = makeMealPlan({ date: '2026-04-06' });
    const recipe = makeRecipe();
    const item = makeMealPlanItem(plan.id, recipe.id);

    const res = await agent().post(`/api/meals/items/${item.id}/recurrence`).send({
      pattern: 'specific_days',
      days_of_week: [1, 3, 5],
      start_date: '2026-04-06',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.pattern, 'specific_days');
    assert.deepEqual(JSON.parse(res.body.days_of_week), [1, 3, 5]);
  });

  it('POST /api/meals/items/:id/recurrence — creates weekly recurrence', async () => {
    const plan = makeMealPlan({ date: '2026-04-06' });
    const recipe = makeRecipe();
    const item = makeMealPlanItem(plan.id, recipe.id);

    const res = await agent().post(`/api/meals/items/${item.id}/recurrence`).send({
      pattern: 'weekly',
      start_date: '2026-04-06',
      end_date: '2026-05-04',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.pattern, 'weekly');
  });

  it('DELETE /api/meals/items/:id/recurrence — removes recurrence', async () => {
    const plan = makeMealPlan({ date: '2026-04-06' });
    const recipe = makeRecipe();
    const item = makeMealPlanItem(plan.id, recipe.id);

    await agent().post(`/api/meals/items/${item.id}/recurrence`).send({
      pattern: 'daily',
      start_date: '2026-04-06',
    });

    const res = await agent().delete(`/api/meals/items/${item.id}/recurrence`);
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);

    // Verify it's gone
    const { db } = setup();
    const rule = db.prepare('SELECT * FROM recurrence_rules WHERE meal_plan_item_id = ?').get(item.id);
    assert.equal(rule, undefined);
  });

  it('POST /api/meals/recurrence/expand — expands daily for 7 days', async () => {
    const plan = makeMealPlan({ date: '2026-04-06', meal_type: 'lunch' });
    const recipe = makeRecipe();
    const item = makeMealPlanItem(plan.id, recipe.id, { servings: 2 });

    await agent().post(`/api/meals/items/${item.id}/recurrence`).send({
      pattern: 'daily',
      start_date: '2026-04-06',
      end_date: '2026-04-12',
    });

    const res = await agent().post('/api/meals/recurrence/expand').send({
      from_date: '2026-04-06',
      to_date: '2026-04-12',
    });
    assert.equal(res.status, 200);
    // Original 2026-04-06 already exists, so expect 6 new days (04-07 through 04-12)
    assert.equal(res.body.items_created, 6);
  });

  it('POST /api/meals/recurrence/expand — expands specific_days correctly (only MWF)', async () => {
    const plan = makeMealPlan({ date: '2026-04-06', meal_type: 'dinner' }); // 2026-04-06 is Monday
    const recipe = makeRecipe();
    const item = makeMealPlanItem(plan.id, recipe.id);

    await agent().post(`/api/meals/items/${item.id}/recurrence`).send({
      pattern: 'specific_days',
      days_of_week: [1, 3, 5], // Mon, Wed, Fri
      start_date: '2026-04-06',
      end_date: '2026-04-19',
    });

    const res = await agent().post('/api/meals/recurrence/expand').send({
      from_date: '2026-04-06',
      to_date: '2026-04-19',
    });
    assert.equal(res.status, 200);
    // 2026-04-06 Mon (exists), 04-08 Wed, 04-10 Fri, 04-13 Mon, 04-15 Wed, 04-17 Fri = 5 new
    assert.equal(res.body.items_created, 5);
  });

  it('POST /api/meals/recurrence/expand — skips dates with existing plans', async () => {
    const plan = makeMealPlan({ date: '2026-04-06', meal_type: 'lunch' });
    const recipe = makeRecipe();
    const item = makeMealPlanItem(plan.id, recipe.id);

    // Pre-create a plan for 04-08
    makeMealPlan({ date: '2026-04-08', meal_type: 'lunch' });

    await agent().post(`/api/meals/items/${item.id}/recurrence`).send({
      pattern: 'daily',
      start_date: '2026-04-06',
      end_date: '2026-04-09',
    });

    const res = await agent().post('/api/meals/recurrence/expand').send({
      from_date: '2026-04-06',
      to_date: '2026-04-09',
    });
    assert.equal(res.status, 200);
    // 04-06 exists (original), 04-07 new, 04-08 exists (pre-created, add item), 04-09 new = 3 new items
    assert.equal(res.body.items_created, 3);
  });

  it('POST /api/meals/recurrence/expand — respects end_date', async () => {
    const plan = makeMealPlan({ date: '2026-04-06', meal_type: 'lunch' });
    const recipe = makeRecipe();
    const item = makeMealPlanItem(plan.id, recipe.id);

    await agent().post(`/api/meals/items/${item.id}/recurrence`).send({
      pattern: 'daily',
      start_date: '2026-04-06',
      end_date: '2026-04-08',
    });

    const res = await agent().post('/api/meals/recurrence/expand').send({
      from_date: '2026-04-06',
      to_date: '2026-04-12',
    });
    assert.equal(res.status, 200);
    // Rule ends 04-08, so only 04-07 and 04-08 are new (04-06 exists)
    assert.equal(res.body.items_created, 2);
  });
});
