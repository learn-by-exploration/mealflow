const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHousehold, makePantryItem, makeShoppingList } = require('./helpers');

describe('Shopping Advanced', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  function setupHousehold() {
    return makeHousehold();
  }

  function addShoppingItem(listId, name, quantity = 1, unit = 'kg', category = 'other') {
    const { db } = setup();
    const r = db.prepare('INSERT INTO shopping_list_items (list_id, name, quantity, unit, category, position, checked) VALUES (?,?,?,?,?,?,0)').run(
      listId, name, quantity, unit, category, 0
    );
    return db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(r.lastInsertRowid);
  }

  it('POST /api/shopping/:id/subtract-pantry — subtracts pantry quantities', async () => {
    const h = setupHousehold();
    makePantryItem(h.id, { name: 'Rice', quantity: 500, unit: 'g' });
    const list = makeShoppingList();
    addShoppingItem(list.id, 'Rice', 1000, 'g');

    const res = await agent().post(`/api/shopping/${list.id}/subtract-pantry`);
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].quantity, 500);
  });

  it('Subtract pantry removes items when quantity reaches 0', async () => {
    const h = setupHousehold();
    makePantryItem(h.id, { name: 'Milk', quantity: 2, unit: 'liter' });
    const list = makeShoppingList();
    addShoppingItem(list.id, 'Milk', 1, 'liter');

    const res = await agent().post(`/api/shopping/${list.id}/subtract-pantry`);
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 0);
  });

  it('Subtract pantry handles no matching pantry items', async () => {
    setupHousehold();
    const list = makeShoppingList();
    addShoppingItem(list.id, 'Exotic Fruit', 3, 'pcs');

    const res = await agent().post(`/api/shopping/${list.id}/subtract-pantry`);
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].quantity, 3);
  });

  it('GET /api/shopping/:id/deeplinks — returns Blinkit URL', async () => {
    const list = makeShoppingList();
    addShoppingItem(list.id, 'Tomato', 500, 'g');

    const res = await agent().get(`/api/shopping/${list.id}/deeplinks`);
    assert.equal(res.status, 200);
    const item = res.body[0];
    assert.ok(item.blinkit.includes('blinkit.com'));
  });

  it('GET /api/shopping/:id/deeplinks — returns Zepto URL', async () => {
    const list = makeShoppingList();
    addShoppingItem(list.id, 'Onion', 1, 'kg');

    const res = await agent().get(`/api/shopping/${list.id}/deeplinks`);
    assert.equal(res.status, 200);
    assert.ok(res.body[0].zepto.includes('zeptonow.com'));
  });

  it('GET /api/shopping/:id/deeplinks — returns BigBasket URL', async () => {
    const list = makeShoppingList();
    addShoppingItem(list.id, 'Atta', 5, 'kg');

    const res = await agent().get(`/api/shopping/${list.id}/deeplinks`);
    assert.equal(res.status, 200);
    assert.ok(res.body[0].bigbasket.includes('bigbasket.com'));
  });

  it('GET /api/shopping/:id/deeplinks — returns Swiggy URL', async () => {
    const list = makeShoppingList();
    addShoppingItem(list.id, 'Paneer', 200, 'g');

    const res = await agent().get(`/api/shopping/${list.id}/deeplinks`);
    assert.equal(res.status, 200);
    assert.ok(res.body[0].swiggy.includes('swiggy.com'));
  });

  it('GET /api/shopping/:id/share — returns formatted text', async () => {
    const list = makeShoppingList({ name: 'Weekly Groceries' });
    addShoppingItem(list.id, 'Rice', 2, 'kg', 'grains');

    const res = await agent().get(`/api/shopping/${list.id}/share`);
    assert.equal(res.status, 200);
    assert.ok(res.body.text.includes('Weekly Groceries'));
    assert.ok(res.body.text.includes('Rice'));
  });

  it('Share format includes category headers', async () => {
    const list = makeShoppingList({ name: 'Test' });
    addShoppingItem(list.id, 'Onion', 500, 'g', 'vegetables');
    addShoppingItem(list.id, 'Rice', 1, 'kg', 'grains');

    const res = await agent().get(`/api/shopping/${list.id}/share`);
    assert.equal(res.status, 200);
    assert.ok(res.body.text.includes('VEGETABLES'));
    assert.ok(res.body.text.includes('GRAINS'));
  });

  it('Deep links URL-encode item names', async () => {
    const list = makeShoppingList();
    addShoppingItem(list.id, 'Basmati Rice', 1, 'kg');

    const res = await agent().get(`/api/shopping/${list.id}/deeplinks`);
    assert.equal(res.status, 200);
    assert.ok(res.body[0].blinkit.includes('Basmati%20Rice'));
  });
});
