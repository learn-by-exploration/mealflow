const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createIngredient, updateIngredient } = require('../schemas/ingredients.schema');
const { NotFoundError } = require('../errors');

module.exports = function ingredientsRoutes({ db }) {
  const router = Router();

  // ─── List ingredients ───
  router.get('/api/ingredients', (req, res) => {
    const { category, q } = req.query;
    let where = 'WHERE user_id = ?';
    const params = [req.userId];

    if (category) { where += ' AND category = ?'; params.push(category); }
    if (q) { where += ' AND name LIKE ?'; params.push(`%${q}%`); }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM ingredients ${where}`).get(...params).cnt;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = (rawLimit > 0 && rawLimit <= 100) ? rawLimit : 20;
    const offset = (page - 1) * limit;

    const sql = `SELECT * FROM ingredients ${where} ORDER BY category, name LIMIT ? OFFSET ?`;
    res.json({ data: db.prepare(sql).all(...params, limit, offset), total, page, limit });
  });

  // ─── Get single ingredient ───
  router.get('/api/ingredients/:id', (req, res) => {
    const ing = db.prepare('SELECT * FROM ingredients WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!ing) throw new NotFoundError('Ingredient', req.params.id);
    res.json(ing);
  });

  // ─── Create ingredient ───
  router.post('/api/ingredients', validate(createIngredient), (req, res) => {
    const data = req.body;
    const result = db.prepare(`
      INSERT INTO ingredients (user_id, name, category, calories, protein, carbs, fat, fiber, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId, data.name, data.category, data.calories, data.protein, data.carbs, data.fat, data.fiber, data.unit);

    const ing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(ing);
  });

  // ─── Update ingredient ───
  router.put('/api/ingredients/:id', validate(updateIngredient), (req, res) => {
    const ing = db.prepare('SELECT * FROM ingredients WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!ing) throw new NotFoundError('Ingredient', req.params.id);

    const data = req.body;
    const fields = [];
    const values = [];

    for (const key of ['name', 'category', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'unit']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }

    if (fields.length) {
      values.push(req.params.id, req.userId);
      db.prepare(`UPDATE ingredients SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  // ─── Delete ingredient ───
  router.delete('/api/ingredients/:id', (req, res) => {
    const ing = db.prepare('SELECT * FROM ingredients WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!ing) throw new NotFoundError('Ingredient', req.params.id);
    db.prepare('DELETE FROM ingredients WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ─── Bulk create ingredients ───
  router.post('/api/ingredients/bulk', (req, res) => {
    const { ingredients } = req.body;
    if (!Array.isArray(ingredients)) return res.status(400).json({ error: 'ingredients array required' });

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO ingredients (user_id, name, category, calories, protein, carbs, fat, fiber, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const created = [];
    for (const data of ingredients) {
      if (!data.name) continue;
      try {
        const r = stmt.run(req.userId, data.name, data.category || 'other', data.calories || 0, data.protein || 0, data.carbs || 0, data.fat || 0, data.fiber || 0, data.unit || 'g');
        if (r.lastInsertRowid) {
          created.push(db.prepare('SELECT * FROM ingredients WHERE id = ?').get(r.lastInsertRowid));
        }
      } catch {}
    }

    res.status(201).json({ created: created.length, ingredients: created });
  });

  return router;
};
