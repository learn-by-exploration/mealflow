const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeFestival, addFastingRule, linkFestivalRecipe, makeRecipe } = require('./helpers');

describe('Festivals', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('GET /api/festivals — lists all festivals', async () => {
    makeFestival({ name: 'Festival A' });
    makeFestival({ name: 'Festival B', type: 'muslim' });
    const res = await agent().get('/api/festivals');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 2);
  });

  it('GET /api/festivals?type=hindu — filters by type', async () => {
    makeFestival({ name: 'Hindu Fest', type: 'hindu' });
    makeFestival({ name: 'Muslim Fest', type: 'muslim' });
    makeFestival({ name: 'Sikh Fest', type: 'sikh' });
    const res = await agent().get('/api/festivals?type=hindu');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Hindu Fest');
  });

  it('GET /api/festivals/upcoming — returns festivals in next 30 days', async () => {
    const today = new Date();
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 10);
    const soonStr = soon.toISOString().split('T')[0];
    const year = String(soon.getFullYear());

    const far = new Date(today);
    far.setDate(far.getDate() + 60);
    const farStr = far.toISOString().split('T')[0];
    const farYear = String(far.getFullYear());

    makeFestival({
      name: 'Soon Fest',
      date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { [year]: soonStr } }),
    });
    makeFestival({
      name: 'Far Fest',
      date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { [farYear]: farStr } }),
    });
    const res = await agent().get('/api/festivals/upcoming');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Soon Fest');
  });

  it('GET /api/festivals/:id — returns festival with fasting rules', async () => {
    const fest = makeFestival({ name: 'Fasting Fest', is_fasting: 1, fasting_type: 'specific_foods' });
    addFastingRule(fest.id, { rule_type: 'deny', category: 'grains', notes: 'No grains' });
    addFastingRule(fest.id, { rule_type: 'allow', ingredient_name: 'Sabudana', notes: 'Sago allowed' });

    const res = await agent().get(`/api/festivals/${fest.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Fasting Fest');
    assert.ok(Array.isArray(res.body.fasting_rules));
    assert.equal(res.body.fasting_rules.length, 2);
  });

  it('GET /api/festivals/:id/recipes — returns linked recipes', async () => {
    const fest = makeFestival({ name: 'Recipe Fest' });
    const recipe = makeRecipe({ name: 'Festival Dish' });
    linkFestivalRecipe(fest.id, recipe.id);

    const res = await agent().get(`/api/festivals/${fest.id}/recipes`);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Festival Dish');
  });

  it('GET /api/festivals/999 — 404 for non-existent', async () => {
    const res = await agent().get('/api/festivals/999');
    assert.equal(res.status, 404);
  });

  it('POST /api/seed/festivals — seeds festival data', async () => {
    const res = await agent().post('/api/seed/festivals');
    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 15, `expected at least 15, got ${res.body.count}`);
  });

  it('Seeded festivals have fasting_rules', async () => {
    await agent().post('/api/seed/festivals');
    const { db } = setup();
    const navratri = db.prepare("SELECT * FROM festivals WHERE name = 'Navratri'").get();
    assert.ok(navratri, 'Navratri should exist');
    const rules = db.prepare('SELECT * FROM fasting_rules WHERE festival_id = ?').all(navratri.id);
    assert.ok(rules.length > 0, 'Navratri should have fasting rules');
  });

  it('Festival count matches expected (at least 15)', async () => {
    await agent().post('/api/seed/festivals');
    const { db } = setup();
    const count = db.prepare('SELECT COUNT(*) AS c FROM festivals').get().c;
    assert.ok(count >= 15, `expected at least 15 festivals, got ${count}`);
  });

  it('GET /api/festivals?type=regional — regions filter works', async () => {
    await agent().post('/api/seed/festivals');
    const res = await agent().get('/api/festivals?type=regional');
    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 2, 'should have at least 2 regional festivals');
    for (const f of res.body) {
      assert.equal(f.type, 'regional');
    }
  });
});
