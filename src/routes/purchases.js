const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { logPurchase } = require('../schemas/pantry.schema');

module.exports = function purchaseRoutes({ db }) {
  const router = Router();

  function getUserHouseholdId(userId) {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId);
    return user ? user.household_id : null;
  }

  // ─── Log a purchase ───
  router.post('/api/purchases', validate(logPurchase), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const { name, quantity, unit, price, store, ingredient_id } = req.body;
    const r = db.prepare(
      'INSERT INTO purchase_history (household_id, ingredient_id, name, quantity, unit, price, store) VALUES (?,?,?,?,?,?,?)'
    ).run(householdId, ingredient_id || null, name, quantity, unit, price || null, store);

    const purchase = db.prepare('SELECT * FROM purchase_history WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(purchase);
  });

  // ─── Price history ───
  router.get('/api/purchases/prices', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.json([]);

    const { name, ingredient_id } = req.query;

    let sql, params;
    if (ingredient_id) {
      sql = 'SELECT * FROM purchase_history WHERE household_id = ? AND ingredient_id = ? ORDER BY purchased_at DESC LIMIT 10';
      params = [householdId, ingredient_id];
    } else if (name) {
      sql = 'SELECT * FROM purchase_history WHERE household_id = ? AND LOWER(name) = LOWER(?) ORDER BY purchased_at DESC LIMIT 10';
      params = [householdId, name];
    } else {
      return res.status(400).json({ error: 'name or ingredient_id required' });
    }

    res.json(db.prepare(sql).all(...params));
  });

  return router;
};
