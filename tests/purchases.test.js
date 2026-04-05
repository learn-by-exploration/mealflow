const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHousehold, makeUser2 } = require('./helpers');

describe('Purchases', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  function setupHousehold() {
    return makeHousehold();
  }

  it('POST /api/purchases — logs purchase', async () => {
    setupHousehold();
    const res = await agent().post('/api/purchases').send({
      name: 'Basmati Rice',
      quantity: 5,
      unit: 'kg',
      price: 450,
      store: 'BigBasket',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Basmati Rice');
    assert.equal(res.body.price, 450);
    assert.equal(res.body.store, 'BigBasket');
  });

  it('GET /api/purchases/prices?name=X — returns price history', async () => {
    const h = setupHousehold();
    const { db } = setup();
    db.prepare('INSERT INTO purchase_history (household_id, name, quantity, unit, price, store) VALUES (?,?,?,?,?,?)').run(
      h.id, 'Onion', 1, 'kg', 30, 'Local'
    );
    db.prepare('INSERT INTO purchase_history (household_id, name, quantity, unit, price, store) VALUES (?,?,?,?,?,?)').run(
      h.id, 'Onion', 2, 'kg', 60, 'BigBasket'
    );

    const res = await agent().get('/api/purchases/prices?name=Onion');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
  });

  it('Price history returns most recent first', async () => {
    const h = setupHousehold();
    const { db } = setup();
    db.prepare("INSERT INTO purchase_history (household_id, name, quantity, unit, price, store, purchased_at) VALUES (?,?,?,?,?,?,?)").run(
      h.id, 'Tomato', 1, 'kg', 20, 'A', '2026-04-01'
    );
    db.prepare("INSERT INTO purchase_history (household_id, name, quantity, unit, price, store, purchased_at) VALUES (?,?,?,?,?,?,?)").run(
      h.id, 'Tomato', 1, 'kg', 30, 'B', '2026-04-05'
    );

    const res = await agent().get('/api/purchases/prices?name=Tomato');
    assert.equal(res.status, 200);
    assert.equal(res.body[0].price, 30);
    assert.equal(res.body[1].price, 20);
  });

  it('Purchases scoped to household', async () => {
    const h = setupHousehold();
    const { db } = setup();
    db.prepare('INSERT INTO purchase_history (household_id, name, quantity, unit, price, store) VALUES (?,?,?,?,?,?)').run(
      h.id, 'Secret Item', 1, 'pcs', 100, 'Secret Store'
    );

    const { agent: agent2 } = makeUser2();
    makeHousehold({ name: 'Other Family', created_by: 2 });

    const res = await agent2.get('/api/purchases/prices?name=Secret%20Item');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0);
  });
});
