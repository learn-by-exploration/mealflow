const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createRecipe, updateRecipe } = require('../schemas/recipes.schema');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');

module.exports = function recipesRoutes({ db, enrichRecipe, enrichRecipes, getNextPosition }) {
  const router = Router();

  // ─── List recipes ───
  router.get('/api/recipes', (req, res) => {
    const { cuisine, difficulty, tag, favorite, q, limit, offset } = req.query;
    let sql = 'SELECT r.* FROM recipes r WHERE r.user_id = ?';
    const params = [req.userId];

    if (cuisine) { sql += ' AND r.cuisine = ?'; params.push(cuisine); }
    if (difficulty) { sql += ' AND r.difficulty = ?'; params.push(difficulty); }
    if (favorite === '1') { sql += ' AND r.is_favorite = 1'; }
    if (q) { sql += ' AND (r.name LIKE ? OR r.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (tag) {
      sql += ' AND r.id IN (SELECT rt.recipe_id FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE t.name = ? AND t.user_id = ?)';
      params.push(tag, req.userId);
    }

    sql += ' ORDER BY r.position, r.created_at DESC';

    if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit, 10) || 50); }
    if (offset) { sql += ' OFFSET ?'; params.push(parseInt(offset, 10) || 0); }

    const recipes = db.prepare(sql).all(...params);
    res.json(enrichRecipes(recipes));
  });

  // ─── Get single recipe ───
  router.get('/api/recipes/:id', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);
    res.json(enrichRecipe(recipe));
  });

  // ─── Create recipe ───
  router.post('/api/recipes', validate(createRecipe), (req, res) => {
    const data = req.body;
    const position = getNextPosition('recipes', 'user_id = ?', [req.userId]);

    const result = db.prepare(`
      INSERT INTO recipes (user_id, name, description, servings, prep_time, cook_time, cuisine, difficulty, image_url, source_url, notes, is_favorite, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.userId, data.name, data.description || '', data.servings || 1,
      data.prep_time || 0, data.cook_time || 0, data.cuisine || '',
      data.difficulty || 'easy', data.image_url || '', data.source_url || '',
      data.notes || '', data.is_favorite || 0, position
    );
    const recipeId = result.lastInsertRowid;

    // Add ingredients if provided
    if (data.ingredients && data.ingredients.length) {
      const stmt = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes, position) VALUES (?, ?, ?, ?, ?, ?)');
      data.ingredients.forEach((ing, i) => {
        stmt.run(recipeId, ing.ingredient_id, ing.quantity || 0, ing.unit || 'g', ing.notes || '', i);
      });
    }

    // Add tags if provided
    if (data.tags && data.tags.length) {
      for (const tagName of data.tags) {
        let tag = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(req.userId, tagName);
        if (!tag) {
          const r = db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)').run(req.userId, tagName);
          tag = { id: r.lastInsertRowid };
        }
        db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      }
    }

    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
    res.status(201).json(enrichRecipe(recipe));
  });

  // ─── Update recipe ───
  router.put('/api/recipes/:id', validate(updateRecipe), (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);

    const data = req.body;
    const fields = [];
    const values = [];

    for (const key of ['name', 'description', 'servings', 'prep_time', 'cook_time', 'cuisine', 'difficulty', 'image_url', 'source_url', 'notes', 'is_favorite']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }

    if (fields.length) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.params.id, req.userId);
      db.prepare(`UPDATE recipes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    }

    // Update ingredients if provided
    if (data.ingredients !== undefined) {
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(req.params.id);
      if (data.ingredients.length) {
        const stmt = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes, position) VALUES (?, ?, ?, ?, ?, ?)');
        data.ingredients.forEach((ing, i) => {
          stmt.run(req.params.id, ing.ingredient_id, ing.quantity || 0, ing.unit || 'g', ing.notes || '', i);
        });
      }
    }

    // Update tags if provided
    if (data.tags !== undefined) {
      db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').run(req.params.id);
      for (const tagName of (data.tags || [])) {
        let tag = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(req.userId, tagName);
        if (!tag) {
          const r = db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)').run(req.userId, tagName);
          tag = { id: r.lastInsertRowid };
        }
        db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(req.params.id, tag.id);
      }
    }

    const updated = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    res.json(enrichRecipe(updated));
  });

  // ─── Delete recipe ───
  router.delete('/api/recipes/:id', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);
    db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ─── Reorder recipes ───
  router.put('/api/recipes/reorder', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    const stmt = db.prepare('UPDATE recipes SET position = ? WHERE id = ? AND user_id = ?');
    ids.forEach((id, i) => stmt.run(i, id, req.userId));
    res.json({ ok: true });
  });

  // ─── Toggle favorite ───
  router.patch('/api/recipes/:id/favorite', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);
    const newVal = recipe.is_favorite ? 0 : 1;
    db.prepare('UPDATE recipes SET is_favorite = ? WHERE id = ?').run(newVal, req.params.id);
    res.json({ is_favorite: newVal });
  });

  return router;
};
