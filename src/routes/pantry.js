const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createPantryItem, updatePantryItem } = require('../schemas/pantry.schema');
const { NotFoundError } = require('../errors');

module.exports = function pantryRoutes({ db }) {
  const router = Router();

  function getUserHouseholdId(userId) {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId);
    return user ? user.household_id : null;
  }

  // ─── List pantry items ───
  router.get('/api/pantry', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.json([]);

    let sql = 'SELECT * FROM pantry WHERE household_id = ?';
    const params = [householdId];

    if (req.query.category) {
      sql += ' AND category = ?';
      params.push(req.query.category);
    }
    if (req.query.location) {
      sql += ' AND location = ?';
      params.push(req.query.location);
    }

    sql += ' ORDER BY name';
    res.json(db.prepare(sql).all(...params));
  });

  // ─── Items expiring soon ───
  router.get('/api/pantry/expiring', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.json([]);

    const days = parseInt(req.query.days, 10) || 7;
    const items = db.prepare(
      `SELECT * FROM pantry WHERE household_id = ? AND expires_at IS NOT NULL AND expires_at <= date('now', '+' || ? || ' days') ORDER BY expires_at`
    ).all(householdId, days);
    res.json(items);
  });

  // ─── Add pantry item (merge if duplicate name) ───
  router.post('/api/pantry', validate(createPantryItem), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const { name, quantity, unit, category, ingredient_id, location, expires_at } = req.body;

    // Check for existing item with same name in household
    const existing = db.prepare('SELECT * FROM pantry WHERE household_id = ? AND LOWER(name) = LOWER(?)').get(householdId, name);
    if (existing) {
      const newQty = existing.quantity + quantity;
      db.prepare('UPDATE pantry SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newQty, existing.id);
      const updated = db.prepare('SELECT * FROM pantry WHERE id = ?').get(existing.id);
      return res.status(200).json(updated);
    }

    const r = db.prepare(
      'INSERT INTO pantry (household_id, ingredient_id, name, quantity, unit, category, location, expires_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(householdId, ingredient_id || null, name, quantity, unit, category, location, expires_at || null);

    const item = db.prepare('SELECT * FROM pantry WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(item);
  });

  // ─── Update pantry item ───
  router.put('/api/pantry/:id', validate(updatePantryItem), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const item = db.prepare('SELECT * FROM pantry WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!item) throw new NotFoundError('Pantry item', req.params.id);

    const fields = [];
    const params = [];
    if (req.body.quantity !== undefined) { fields.push('quantity = ?'); params.push(req.body.quantity); }
    if (req.body.location !== undefined) { fields.push('location = ?'); params.push(req.body.location); }
    if (req.body.expires_at !== undefined) { fields.push('expires_at = ?'); params.push(req.body.expires_at); }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(item.id);
      db.prepare(`UPDATE pantry SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare('SELECT * FROM pantry WHERE id = ?').get(item.id);
    res.json(updated);
  });

  // ─── Delete pantry item ───
  router.delete('/api/pantry/:id', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const item = db.prepare('SELECT * FROM pantry WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!item) throw new NotFoundError('Pantry item', req.params.id);

    db.prepare('DELETE FROM pantry WHERE id = ?').run(item.id);
    res.json({ ok: true });
  });

  return router;
};
