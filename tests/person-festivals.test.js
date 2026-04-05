const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHousehold, makePerson, makeFestival, linkPersonFestival } = require('./helpers');

describe('Person Festivals', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('PUT /api/persons/:id/festivals — sets festivals for person', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'Devotee' });
    const f1 = makeFestival({ name: 'Fest A' });
    const f2 = makeFestival({ name: 'Fest B', type: 'muslim' });

    const res = await agent()
      .put(`/api/persons/${person.id}/festivals`)
      .send({ festival_ids: [f1.id, f2.id] });
    assert.equal(res.status, 200);

    const { db } = setup();
    const links = db.prepare('SELECT * FROM person_festivals WHERE person_id = ?').all(person.id);
    assert.equal(links.length, 2);
  });

  it('PUT /api/persons/:id/festivals — replaces previous festivals', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'Replacer' });
    const f1 = makeFestival({ name: 'Old Fest' });
    const f2 = makeFestival({ name: 'New Fest', type: 'sikh' });

    linkPersonFestival(person.id, f1.id);

    // Replace with only f2
    const res = await agent()
      .put(`/api/persons/${person.id}/festivals`)
      .send({ festival_ids: [f2.id] });
    assert.equal(res.status, 200);

    const { db } = setup();
    const links = db.prepare('SELECT * FROM person_festivals WHERE person_id = ?').all(person.id);
    assert.equal(links.length, 1);
    assert.equal(links[0].festival_id, f2.id);
  });

  it('PUT /api/persons/:id/festivals — rejects invalid person (wrong household)', async () => {
    // Person not in user's household
    const res = await agent()
      .put('/api/persons/9999/festivals')
      .send({ festival_ids: [1] });
    // Should get 400 (no household) or 404
    assert.ok([400, 404].includes(res.status));
  });

  it('Cascading: deleting person removes person_festivals', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'ToDelete' });
    const fest = makeFestival({ name: 'Cascade Fest' });
    linkPersonFestival(person.id, fest.id);

    // Delete via API
    const res = await agent().delete(`/api/persons/${person.id}`);
    assert.equal(res.status, 200);

    const { db } = setup();
    const links = db.prepare('SELECT * FROM person_festivals WHERE person_id = ?').all(person.id);
    assert.equal(links.length, 0);
  });

  it('GET /api/persons — includes observed festivals count', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'Counter' });
    const f1 = makeFestival({ name: 'Count A' });
    const f2 = makeFestival({ name: 'Count B', type: 'regional' });
    linkPersonFestival(person.id, f1.id);
    linkPersonFestival(person.id, f2.id);

    const res = await agent().get('/api/persons');
    assert.equal(res.status, 200);
    const p = res.body.find(x => x.name === 'Counter');
    assert.ok(p, 'Counter person should exist');
    assert.equal(p.festival_count, 2);
  });
});
