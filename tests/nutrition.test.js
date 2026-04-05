const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeRecipe, makeHousehold, makePerson } = require('./helpers');

describe('Nutrition (micronutrients & person_id)', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('Nutrition log accepts person_id field', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const person = makePerson(hh.id, { name: 'Alice' });

    const res = await agent().post('/api/nutrition').send({
      date: '2026-04-05',
      meal_type: 'lunch',
      custom_name: 'Salad',
      calories: 200,
      person_id: person.id
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.person_id, person.id);
  });

  it('Nutrition log includes micronutrient fields (iron, calcium)', async () => {
    const res = await agent().post('/api/nutrition').send({
      date: '2026-04-05',
      meal_type: 'lunch',
      custom_name: 'Iron-rich meal',
      calories: 300,
      iron: 5.5,
      calcium: 120
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.iron, 5.5);
    assert.equal(res.body.calcium, 120);
  });

  it('Backward compat: nutrition log works without person_id', async () => {
    const res = await agent().post('/api/nutrition').send({
      date: '2026-04-05',
      meal_type: 'dinner',
      custom_name: 'Regular meal',
      calories: 500
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.person_id, null);
  });

  it('Micronutrient fields have defaults of 0', async () => {
    const res = await agent().post('/api/nutrition').send({
      date: '2026-04-05',
      meal_type: 'breakfast',
      custom_name: 'Toast'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.iron, 0);
    assert.equal(res.body.calcium, 0);
  });
});
