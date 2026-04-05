const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHousehold, makePerson, makeMealPlan, assignPersonToItem } = require('./helpers');

describe('Person Assignments', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  function createMealPlanItem() {
    const { db } = setup();
    const mp = makeMealPlan({ date: '2026-04-05', meal_type: 'lunch' });
    const r = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(mp.id, null, 1, 0);
    return { planId: mp.id, itemId: r.lastInsertRowid };
  }

  it('POST /api/meals/items/:itemId/assign — assigns person to item', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id);
    const { itemId } = createMealPlanItem();

    const res = await agent().post(`/api/meals/items/${itemId}/assign`).send({ person_id: person.id });
    assert.equal(res.status, 201);
    assert.equal(res.body.person_id, person.id);
    assert.equal(res.body.meal_plan_item_id, itemId);
  });

  it('POST /api/meals/items/:itemId/assign — with spice/sugar overrides', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id);
    const { itemId } = createMealPlanItem();

    const res = await agent().post(`/api/meals/items/${itemId}/assign`).send({
      person_id: person.id,
      spice_override: 1,
      sugar_override: 5,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.spice_override, 1);
    assert.equal(res.body.sugar_override, 5);
  });

  it('POST /api/meals/items/:itemId/assign — with notes', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id);
    const { itemId } = createMealPlanItem();

    const res = await agent().post(`/api/meals/items/${itemId}/assign`).send({
      person_id: person.id,
      notes: 'Extra mild please',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.notes, 'Extra mild please');
  });

  it('POST /api/meals/items/:itemId/assign — rejects duplicate assignment (409)', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id);
    const { itemId } = createMealPlanItem();

    await agent().post(`/api/meals/items/${itemId}/assign`).send({ person_id: person.id });
    const res = await agent().post(`/api/meals/items/${itemId}/assign`).send({ person_id: person.id });
    assert.equal(res.status, 409);
  });

  it('POST /api/meals/items/:itemId/assign — rejects invalid person_id', async () => {
    makeHousehold({ created_by: 1 });
    const { itemId } = createMealPlanItem();

    const res = await agent().post(`/api/meals/items/${itemId}/assign`).send({ person_id: 9999 });
    assert.equal(res.status, 404);
  });

  it('DELETE /api/meals/items/:itemId/assign/:personId — unassigns person', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id);
    const { itemId } = createMealPlanItem();
    assignPersonToItem(itemId, person.id);

    const res = await agent().delete(`/api/meals/items/${itemId}/assign/${person.id}`);
    assert.equal(res.status, 200);
  });

  it('DELETE /api/meals/items/:itemId/assign/:personId — returns 404 for non-existent', async () => {
    makeHousehold({ created_by: 1 });
    const { itemId } = createMealPlanItem();

    const res = await agent().delete(`/api/meals/items/${itemId}/assign/9999`);
    assert.equal(res.status, 404);
  });

  it('Cascade: deleting meal plan item cascades to person_assignments', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id);
    const mp = makeMealPlan({ date: '2026-04-05', meal_type: 'lunch' });
    const { db } = setup();
    const r = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(mp.id, null, 1, 0);
    const itemId = r.lastInsertRowid;
    assignPersonToItem(itemId, person.id);

    // Delete item via API
    await agent().delete(`/api/meals/${mp.id}/items/${itemId}`);

    const assignments = db.prepare('SELECT * FROM person_assignments WHERE meal_plan_item_id = ?').all(itemId);
    assert.equal(assignments.length, 0);
  });
});
