const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHousehold, makePantryItem, makeUser2 } = require('./helpers');

describe('Pantry', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  function setupHousehold() {
    return makeHousehold();
  }

  it('POST /api/pantry — creates pantry item', async () => {
    setupHousehold();
    const res = await agent().post('/api/pantry').send({
      name: 'Basmati Rice',
      quantity: 2000,
      unit: 'g',
      category: 'grains',
      location: 'kitchen',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Basmati Rice');
    assert.equal(res.body.quantity, 2000);
    assert.equal(res.body.location, 'kitchen');
  });

  it('POST /api/pantry — merges quantity for duplicate name', async () => {
    const h = setupHousehold();
    makePantryItem(h.id, { name: 'Sugar', quantity: 500, unit: 'g' });

    const res = await agent().post('/api/pantry').send({
      name: 'Sugar',
      quantity: 300,
      unit: 'g',
      category: 'sweeteners',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.quantity, 800);
  });

  it('GET /api/pantry — lists items for household', async () => {
    const h = setupHousehold();
    makePantryItem(h.id, { name: 'Rice' });
    makePantryItem(h.id, { name: 'Wheat' });

    const res = await agent().get('/api/pantry');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
  });

  it('GET /api/pantry?location=fridge — filters by location', async () => {
    const h = setupHousehold();
    makePantryItem(h.id, { name: 'Milk', location: 'fridge' });
    makePantryItem(h.id, { name: 'Rice', location: 'kitchen' });

    const res = await agent().get('/api/pantry?location=fridge');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Milk');
  });

  it('GET /api/pantry/expiring — returns items expiring soon', async () => {
    const h = setupHousehold();
    const { db } = setup();
    // Expiring in 3 days
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    db.prepare('INSERT INTO pantry (household_id, name, quantity, unit, category, location, expires_at) VALUES (?,?,?,?,?,?,?)').run(
      h.id, 'Yogurt', 1, 'kg', 'dairy', 'fridge', soon
    );
    db.prepare('INSERT INTO pantry (household_id, name, quantity, unit, category, location, expires_at) VALUES (?,?,?,?,?,?,?)').run(
      h.id, 'Flour', 5, 'kg', 'grains', 'kitchen', later
    );

    const res = await agent().get('/api/pantry/expiring');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, 'Yogurt');
  });

  it('PUT /api/pantry/:id — updates quantity', async () => {
    const h = setupHousehold();
    const item = makePantryItem(h.id, { name: 'Oil', quantity: 500 });

    const res = await agent().put(`/api/pantry/${item.id}`).send({ quantity: 250 });
    assert.equal(res.status, 200);
    assert.equal(res.body.quantity, 250);
  });

  it('DELETE /api/pantry/:id — removes item', async () => {
    const h = setupHousehold();
    const item = makePantryItem(h.id, { name: 'Old Spice' });

    const res = await agent().delete(`/api/pantry/${item.id}`);
    assert.equal(res.status, 200);

    const check = await agent().get('/api/pantry');
    assert.equal(check.body.length, 0);
  });

  it('Pantry scoped to household (other user cannot see)', async () => {
    const h = setupHousehold();
    makePantryItem(h.id, { name: 'Secret Rice' });

    const { agent: agent2 } = makeUser2();
    const h2 = makeHousehold({ name: 'Other Family', created_by: 2 });

    const res = await agent2.get('/api/pantry');
    assert.equal(res.status, 200);
    const names = res.body.map(i => i.name);
    assert.ok(!names.includes('Secret Rice'));
  });
});
