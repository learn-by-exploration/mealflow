const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHousehold, makePerson } = require('./helpers');

describe('Persons', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('POST /api/persons — creates person with all fields', async () => {
    makeHousehold({ created_by: 1 });
    const res = await agent().post('/api/persons').send({
      name: 'Grandma',
      dietary_type: 'jain',
      age_group: 'senior',
      spice_level: 1,
      sugar_level: 2,
      restrictions: ['no onion', 'no garlic'],
      avatar_emoji: '👵',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Grandma');
    assert.equal(res.body.dietary_type, 'jain');
    assert.equal(res.body.age_group, 'senior');
    assert.equal(res.body.spice_level, 1);
    assert.equal(res.body.sugar_level, 2);
  });

  it('POST /api/persons — validates dietary_type enum', async () => {
    makeHousehold({ created_by: 1 });
    const res = await agent().post('/api/persons').send({
      name: 'Test',
      dietary_type: 'pescatarian',
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/persons — validates spice_level bounds (1-5)', async () => {
    makeHousehold({ created_by: 1 });
    const res = await agent().post('/api/persons').send({
      name: 'Test',
      spice_level: 10,
    });
    assert.equal(res.status, 400);
  });

  it('GET /api/persons — lists persons in household', async () => {
    const hh = makeHousehold({ created_by: 1 });
    makePerson(hh.id, { name: 'Person A' });
    makePerson(hh.id, { name: 'Person B' });
    const res = await agent().get('/api/persons');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
  });

  it('PUT /api/persons/:id — updates person', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id);
    const res = await agent().put(`/api/persons/${person.id}`).send({ name: 'Updated Name', spice_level: 5 });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Updated Name');
    assert.equal(res.body.spice_level, 5);
  });

  it('PUT /api/persons/:id — rejects invalid id / wrong household', async () => {
    makeHousehold({ created_by: 1 });
    const res = await agent().put('/api/persons/9999').send({ name: 'Nope' });
    assert.equal(res.status, 404);
  });

  it('DELETE /api/persons/:id — removes person', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id);
    const res = await agent().delete(`/api/persons/${person.id}`);
    assert.equal(res.status, 200);
  });

  it('DELETE /api/persons/:id — cascades to person_assignments', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id);
    const { db } = setup();
    const mp = db.prepare("INSERT INTO meal_plans (user_id, date, meal_type) VALUES (?,?,?)").run(1, '2026-04-05', 'lunch');
    const item = db.prepare("INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)").run(mp.lastInsertRowid, null, 1, 0);
    db.prepare("INSERT INTO person_assignments (meal_plan_item_id, person_id, servings) VALUES (?,?,?)").run(item.lastInsertRowid, person.id, 1);

    await agent().delete(`/api/persons/${person.id}`);
    const assignments = db.prepare('SELECT * FROM person_assignments WHERE person_id = ?').all(person.id);
    assert.equal(assignments.length, 0);
  });

  it('POST /api/persons — validates restrictions is array', async () => {
    makeHousehold({ created_by: 1 });
    const res = await agent().post('/api/persons').send({
      name: 'Test',
      restrictions: 'not an array',
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/persons — requires household first (returns 400)', async () => {
    const res = await agent().post('/api/persons').send({ name: 'Orphan' });
    assert.equal(res.status, 400);
  });
});
