const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeRecipe, makeMealPlan, makeMealPlanItem, makeFestival } = require('./helpers');

describe('Calendar', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('GET /api/calendar/2026/4 — returns days array for April', async () => {
    const res = await agent().get('/api/calendar/2026/4');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.days));
    assert.equal(res.body.days.length, 30); // April has 30 days
    assert.equal(res.body.days[0].date, '2026-04-01');
    assert.equal(res.body.days[29].date, '2026-04-30');
  });

  it('Calendar shows meal type counts per day', async () => {
    const plan = makeMealPlan({ date: '2026-04-10', meal_type: 'lunch' });
    const recipe = makeRecipe();
    makeMealPlanItem(plan.id, recipe.id);
    makeMealPlanItem(plan.id, recipe.id, { position: 1 });

    const plan2 = makeMealPlan({ date: '2026-04-10', meal_type: 'dinner' });
    makeMealPlanItem(plan2.id, recipe.id);

    const res = await agent().get('/api/calendar/2026/4');
    assert.equal(res.status, 200);
    const day10 = res.body.days.find(d => d.date === '2026-04-10');
    assert.ok(day10);
    assert.ok(Array.isArray(day10.meals));
    const lunch = day10.meals.find(m => m.type === 'lunch');
    assert.ok(lunch);
    assert.equal(lunch.item_count, 2);
    const dinner = day10.meals.find(m => m.type === 'dinner');
    assert.ok(dinner);
    assert.equal(dinner.item_count, 1);
  });

  it('Calendar includes festival names for applicable days', async () => {
    makeFestival({
      name: 'Ram Navami',
      date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-15' } }),
    });

    const res = await agent().get('/api/calendar/2026/4');
    assert.equal(res.status, 200);
    const day15 = res.body.days.find(d => d.date === '2026-04-15');
    assert.ok(day15);
    assert.ok(Array.isArray(day15.festival_names));
    assert.ok(day15.festival_names.includes('Ram Navami'));
  });

  it('GET /api/calendar/today — returns today\'s summary', async () => {
    const res = await agent().get('/api/calendar/today');
    assert.equal(res.status, 200);
    assert.ok(res.body.date);
    assert.ok(Array.isArray(res.body.meals));
    assert.ok(Array.isArray(res.body.festival_names));
  });
});
