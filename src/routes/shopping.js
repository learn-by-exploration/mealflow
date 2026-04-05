const { Router } = require('express');
const { NotFoundError } = require('../errors');

module.exports = function shoppingRoutes({ db }) {
  const router = Router();

  // ─── List shopping lists ───
  router.get('/api/shopping', (req, res) => {
    const lists = db.prepare('SELECT * FROM shopping_lists WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
    for (const list of lists) {
      list.items = db.prepare('SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY category, position').all(list.id);
      list.total_items = list.items.length;
      list.checked_items = list.items.filter(i => i.checked).length;
    }
    res.json(lists);
  });

  // ─── Get single shopping list ───
  router.get('/api/shopping/:id', (req, res) => {
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!list) throw new NotFoundError('Shopping list', req.params.id);
    list.items = db.prepare('SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY category, position').all(list.id);
    res.json(list);
  });

  // ─── Create shopping list ───
  router.post('/api/shopping', (req, res) => {
    const { name, date_from, date_to } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = db.prepare('INSERT INTO shopping_lists (user_id, name, date_from, date_to) VALUES (?, ?, ?, ?)')
      .run(req.userId, name, date_from || null, date_to || null);

    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(list);
  });

  // ─── Generate shopping list from meal plans ───
  router.post('/api/shopping/generate', (req, res) => {
    const { date_from, date_to, name } = req.body;
    if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to required' });

    // Get all meal plan items in date range
    const items = db.prepare(`
      SELECT ri.ingredient_id, i.name, i.category, ri.quantity, ri.unit, mpi.servings AS meal_servings, r.servings AS recipe_servings
      FROM meal_plans mp
      JOIN meal_plan_items mpi ON mpi.meal_plan_id = mp.id
      JOIN recipes r ON r.id = mpi.recipe_id
      JOIN recipe_ingredients ri ON ri.recipe_id = r.id
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE mp.user_id = ? AND mp.date >= ? AND mp.date <= ?
        AND (mpi.is_leftover = 0 OR mpi.is_leftover IS NULL)
    `).all(req.userId, date_from, date_to);

    // Aggregate by ingredient
    const aggregated = {};
    for (const item of items) {
      const key = `${item.ingredient_id}_${item.unit}`;
      const factor = (item.meal_servings || 1) / (item.recipe_servings || 1);
      if (!aggregated[key]) {
        aggregated[key] = {
          ingredient_id: item.ingredient_id,
          name: item.name,
          category: item.category,
          quantity: 0,
          unit: item.unit,
        };
      }
      aggregated[key].quantity += (item.quantity || 0) * factor;
    }

    // Create shopping list
    const listName = name || `Shopping ${date_from} to ${date_to}`;
    const result = db.prepare('INSERT INTO shopping_lists (user_id, name, date_from, date_to) VALUES (?, ?, ?, ?)')
      .run(req.userId, listName, date_from, date_to);
    const listId = result.lastInsertRowid;

    // Add aggregated items
    const stmt = db.prepare('INSERT INTO shopping_list_items (list_id, ingredient_id, name, quantity, unit, category, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let pos = 0;
    for (const item of Object.values(aggregated)) {
      stmt.run(listId, item.ingredient_id, item.name, Math.round(item.quantity * 10) / 10, item.unit, item.category, pos++);
    }

    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(listId);
    list.items = db.prepare('SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY category, position').all(listId);
    res.status(201).json(list);
  });

  // ─── Add item to shopping list ───
  router.post('/api/shopping/:id/items', (req, res) => {
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!list) throw new NotFoundError('Shopping list', req.params.id);

    const { name, quantity, unit, category, ingredient_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM shopping_list_items WHERE list_id = ?').get(list.id).next;
    const result = db.prepare('INSERT INTO shopping_list_items (list_id, ingredient_id, name, quantity, unit, category, position) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(list.id, ingredient_id || null, name, quantity || 0, unit || '', category || 'other', maxPos);

    const item = db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  });

  // ─── Toggle item checked ───
  router.patch('/api/shopping/:id/items/:itemId/toggle', (req, res) => {
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!list) throw new NotFoundError('Shopping list', req.params.id);

    const item = db.prepare('SELECT * FROM shopping_list_items WHERE id = ? AND list_id = ?').get(req.params.itemId, list.id);
    if (!item) throw new NotFoundError('Shopping list item', req.params.itemId);

    db.prepare('UPDATE shopping_list_items SET checked = ? WHERE id = ?').run(item.checked ? 0 : 1, item.id);
    res.json({ checked: !item.checked });
  });

  // ─── Delete shopping list item ───
  router.delete('/api/shopping/:id/items/:itemId', (req, res) => {
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!list) throw new NotFoundError('Shopping list', req.params.id);
    db.prepare('DELETE FROM shopping_list_items WHERE id = ? AND list_id = ?').run(req.params.itemId, list.id);
    res.json({ ok: true });
  });

  // ─── Delete shopping list ───
  router.delete('/api/shopping/:id', (req, res) => {
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!list) throw new NotFoundError('Shopping list', req.params.id);
    db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
