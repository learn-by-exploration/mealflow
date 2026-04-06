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

  // ─── List shopping list items (paginated) ───
  router.get('/api/shopping/:id/items', (req, res) => {
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!list) throw new NotFoundError('Shopping list', req.params.id);

    const total = db.prepare('SELECT COUNT(*) as cnt FROM shopping_list_items WHERE list_id = ?').get(list.id).cnt;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = (rawLimit > 0 && rawLimit <= 100) ? rawLimit : 20;
    const offset = (page - 1) * limit;

    const items = db.prepare('SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY category, position LIMIT ? OFFSET ?')
      .all(list.id, limit, offset);

    res.json({ data: items, total, page, limit });
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

    // Auto-update completion tracking
    updateCompletionStatus(db, list.id);

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

  // ─── Subtract pantry quantities from shopping list ───
  router.post('/api/shopping/:id/subtract-pantry', (req, res) => {
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!list) throw new NotFoundError('Shopping list', req.params.id);

    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    const householdId = user ? user.household_id : null;

    const items = db.prepare('SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY category, position').all(list.id);

    const updateStmt = db.prepare('UPDATE shopping_list_items SET quantity = ? WHERE id = ?');
    const deleteStmt = db.prepare('DELETE FROM shopping_list_items WHERE id = ?');

    for (const item of items) {
      if (!householdId) continue;
      const pantryItem = db.prepare(
        'SELECT * FROM pantry WHERE household_id = ? AND LOWER(name) = LOWER(?)'
      ).get(householdId, item.name);
      if (!pantryItem) continue;

      const remaining = item.quantity - pantryItem.quantity;
      if (remaining <= 0) {
        deleteStmt.run(item.id);
      } else {
        updateStmt.run(remaining, item.id);
      }
    }

    const updatedItems = db.prepare('SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY category, position').all(list.id);
    res.json({ ...list, items: updatedItems });
  });

  // ─── Generate quick-commerce deep links ───
  router.get('/api/shopping/:id/deeplinks', (req, res) => {
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!list) throw new NotFoundError('Shopping list', req.params.id);

    const items = db.prepare('SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY category, position').all(list.id);

    const deeplinks = items.map(item => {
      const encoded = encodeURIComponent(item.name);
      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        blinkit: `https://blinkit.com/s/?q=${encoded}`,
        zepto: `https://www.zeptonow.com/search?query=${encoded}`,
        bigbasket: `https://www.bigbasket.com/ps/?q=${encoded}`,
        swiggy: `https://www.swiggy.com/instamart/search?query=${encoded}`,
      };
    });

    res.json(deeplinks);
  });

  // ─── Share shopping list as formatted text ───
  router.get('/api/shopping/:id/share', (req, res) => {
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!list) throw new NotFoundError('Shopping list', req.params.id);

    const items = db.prepare('SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY category, position').all(list.id);

    const categoryEmojis = {
      grains: '📦', vegetables: '🥬', fruits: '🍎', dairy: '🥛',
      spices: '🌶️', oils: '🫒', meat: '🥩', seafood: '🐟',
      beverages: '🥤', snacks: '🍿', other: '📦',
    };

    // Group by category
    const grouped = {};
    for (const item of items) {
      const cat = item.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }

    let text = `🛒 Shopping List: ${list.name}\n`;

    for (const [category, catItems] of Object.entries(grouped)) {
      const emoji = categoryEmojis[category] || '📦';
      text += `\n${emoji} ${category.toUpperCase()}\n`;
      for (const item of catItems) {
        const check = item.checked ? '☑' : '☐';
        text += `${check} ${item.name} — ${item.quantity} ${item.unit}\n`;
      }
    }

    res.json({ text: text.trim() });
  });

  return router;
};

function updateCompletionStatus(db, listId) {
  const total = db.prepare('SELECT COUNT(*) AS c FROM shopping_list_items WHERE list_id = ?').get(listId).c;
  const checked = db.prepare('SELECT COUNT(*) AS c FROM shopping_list_items WHERE list_id = ? AND checked = 1').get(listId).c;

  if (total > 0 && checked === total) {
    db.prepare('UPDATE shopping_lists SET completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(listId);
  } else {
    db.prepare('UPDATE shopping_lists SET completed_at = NULL WHERE id = ?').run(listId);
  }
}
