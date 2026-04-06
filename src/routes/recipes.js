const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const { validate } = require('../middleware/validate');
const { createRecipe, updateRecipe } = require('../schemas/recipes.schema');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');

module.exports = function recipesRoutes({ db, dbDir, enrichRecipe, enrichRecipes, getNextPosition }) {
  const router = Router();

  // ─── Image upload setup ───
  const imageDir = path.join(dbDir, '..', 'data', 'images');
  if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: imageDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `recipe-${crypto.randomUUID()}${ext}`);
    },
  });

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (allowedMimes.includes(file.mimetype)) return cb(null, true);
      cb(new ValidationError('Only JPEG, PNG, and WebP images are allowed'));
    },
  });

  // ─── FTS Search ───
  router.get('/api/recipes/search', (req, res) => {
    const { q, region, cuisine, difficulty, dietary } = req.query;
    let recipes;

    if (q) {
      // Sanitize FTS query: strip special chars, add prefix matching
      const sanitized = q.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      if (!sanitized) {
        return res.json([]);
      }
      const ftsQuery = sanitized.split(/\s+/).map(w => `"${w}"*`).join(' ');
      let sql = `SELECT r.* FROM recipes r
        JOIN recipes_fts f ON f.rowid = r.id
        WHERE recipes_fts MATCH ? AND r.user_id = ? AND r.deleted_at IS NULL`;
      const params = [ftsQuery, req.userId];

      if (region) { sql += ' AND r.region = ?'; params.push(region); }
      if (cuisine) { sql += ' AND r.cuisine = ?'; params.push(cuisine); }
      if (difficulty) { sql += ' AND r.difficulty = ?'; params.push(difficulty); }

      sql += ' ORDER BY rank';
      recipes = db.prepare(sql).all(...params);
    } else {
      let sql = 'SELECT r.* FROM recipes r WHERE r.user_id = ? AND r.deleted_at IS NULL';
      const params = [req.userId];

      if (region) { sql += ' AND r.region = ?'; params.push(region); }
      if (cuisine) { sql += ' AND r.cuisine = ?'; params.push(cuisine); }
      if (difficulty) { sql += ' AND r.difficulty = ?'; params.push(difficulty); }

      sql += ' ORDER BY r.name';
      recipes = db.prepare(sql).all(...params);
    }

    if (dietary) {
      recipes = recipes.filter(r => {
        const tags = db.prepare('SELECT t.name FROM tags t JOIN recipe_tags rt ON rt.tag_id = t.id WHERE rt.recipe_id = ?').all(r.id);
        return tags.some(t => t.name === dietary);
      });
    }

    res.json(enrichRecipes(recipes));
  });

  // ─── List distinct regions with counts ───
  router.get('/api/recipes/regions', (req, res) => {
    const regions = db.prepare(`
      SELECT region, COUNT(*) as count FROM recipes
      WHERE user_id = ? AND region != ''
      GROUP BY region ORDER BY count DESC
    `).all(req.userId);
    res.json(regions);
  });

  // ─── Reorder recipes ───
  router.put('/api/recipes/reorder', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    const stmt = db.prepare('UPDATE recipes SET position = ? WHERE id = ? AND user_id = ?');
    ids.forEach((id, i) => stmt.run(i, id, req.userId));
    res.json({ ok: true });
  });

  // ─── Clone system recipe ───
  router.post('/api/recipes/:id/clone', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);

    const position = getNextPosition('recipes', 'user_id = ?', [req.userId]);

    const result = db.prepare(`
      INSERT INTO recipes (user_id, name, description, servings, prep_time, cook_time, cuisine, difficulty, image_url, source_url, notes, region, is_system, is_favorite, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      req.userId, recipe.name, recipe.description, recipe.servings,
      recipe.prep_time, recipe.cook_time, recipe.cuisine, recipe.difficulty,
      recipe.image_url || '', recipe.source_url || '', recipe.notes || '',
      recipe.region || '', position
    );
    const newId = result.lastInsertRowid;

    // Copy ingredients
    const ings = db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ?').all(recipe.id);
    const ingStmt = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes, position) VALUES (?, ?, ?, ?, ?, ?)');
    for (const ing of ings) {
      ingStmt.run(newId, ing.ingredient_id, ing.quantity, ing.unit, ing.notes, ing.position);
    }

    // Copy tags
    const tags = db.prepare('SELECT tag_id FROM recipe_tags WHERE recipe_id = ?').all(recipe.id);
    const tagStmt = db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)');
    for (const t of tags) {
      tagStmt.run(newId, t.tag_id);
    }

    const cloned = db.prepare('SELECT * FROM recipes WHERE id = ?').get(newId);
    res.status(201).json(enrichRecipe(cloned));
  });

  // ─── Scaled recipe ───
  router.get('/api/recipes/:id/scaled/:servings', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);

    const targetServings = parseFloat(req.params.servings);
    if (isNaN(targetServings) || targetServings <= 0) {
      throw new ValidationError('Invalid servings value');
    }

    const enriched = enrichRecipe(recipe);
    const factor = targetServings / (recipe.servings || 1);

    enriched.servings = targetServings;
    enriched.ingredients = enriched.ingredients.map(ing => ({
      ...ing,
      quantity: Math.round(ing.quantity * factor * 100) / 100,
    }));

    res.json(enriched);
  });

  // ─── PO-13: Recipe of the Day ───
  router.get('/api/recipes/suggestion/daily', (req, res) => {
    // Deterministic rotation based on day-of-year
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

    const recipes = db.prepare(
      'SELECT * FROM recipes WHERE user_id = ? AND deleted_at IS NULL ORDER BY id'
    ).all(req.userId);

    if (!recipes.length) return res.json(null);

    // Pick recipe based on day rotation
    const idx = dayOfYear % recipes.length;
    const recipe = recipes[idx];
    const enriched = enrichRecipe(recipe);

    res.json(enriched);
  });

  // ─── Trash — list soft-deleted recipes ───
  router.get('/api/recipes/trash', (req, res) => {
    const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .all(req.userId);
    res.json(enrichRecipes(recipes));
  });

  // ─── List recipes ───
  router.get('/api/recipes', (req, res) => {
    const { cuisine, difficulty, tag, favorite, q, suitable_for, cooking_method, category } = req.query;
    let where = 'WHERE r.user_id = ? AND r.deleted_at IS NULL';
    const params = [req.userId];

    if (cuisine) { where += ' AND r.cuisine = ?'; params.push(cuisine); }
    if (difficulty) { where += ' AND r.difficulty = ?'; params.push(difficulty); }
    if (favorite === '1') { where += ' AND r.is_favorite = 1'; }
    if (q) { where += ' AND (r.name LIKE ? OR r.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (tag) {
      where += ' AND r.id IN (SELECT rt.recipe_id FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE t.name = ? AND t.user_id = ?)';
      params.push(tag, req.userId);
    }
    if (cooking_method) { where += ' AND r.cooking_method = ?'; params.push(cooking_method); }
    if (category) { where += ' AND r.category = ?'; params.push(category); }
    if (suitable_for) { where += " AND r.meal_suitability LIKE ?"; params.push(`%"${suitable_for}"%`); }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM recipes r ${where}`).get(...params).cnt;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = (rawLimit > 0 && rawLimit <= 100) ? rawLimit : 20;
    const offset = (page - 1) * limit;

    // Sorting: ?sort=name|created_at|updated_at &order=asc|desc
    const allowedSorts = { name: 'r.name', created_at: 'r.created_at', updated_at: 'r.updated_at' };
    const sortCol = allowedSorts[req.query.sort] || 'r.created_at';
    const sortOrder = req.query.order === 'asc' ? 'ASC' : 'DESC';

    const sql = `SELECT r.* FROM recipes r ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`;
    const recipes = db.prepare(sql).all(...params, limit, offset);

    res.json({ data: enrichRecipes(recipes), total, page, limit });
  });

  // ─── Get single recipe ───
  router.get('/api/recipes/:id', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);
    res.json(enrichRecipe(recipe));
  });

  // ─── Create recipe ───
  router.post('/api/recipes', validate(createRecipe), (req, res) => {
    const data = req.body;
    const position = getNextPosition('recipes', 'user_id = ?', [req.userId]);

    const result = db.prepare(`
      INSERT INTO recipes (user_id, name, description, servings, prep_time, cook_time, cuisine, difficulty, image_url, source_url, notes, region, is_favorite, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.userId, data.name, data.description || '', data.servings || 1,
      data.prep_time || 0, data.cook_time || 0, data.cuisine || '',
      data.difficulty || 'easy', data.image_url || '', data.source_url || '',
      data.notes || '', data.region || '', data.is_favorite || 0, position
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
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);

    // Save version snapshot before applying changes
    const maxVersion = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM recipe_versions WHERE recipe_id = ?').get(req.params.id).v;
    const snapshot = { ...recipe };
    delete snapshot.id;
    delete snapshot.user_id;
    db.prepare('INSERT INTO recipe_versions (recipe_id, version, data_json) VALUES (?, ?, ?)').run(
      req.params.id, maxVersion + 1, JSON.stringify(snapshot)
    );

    const data = req.body;
    const fields = [];
    const values = [];

    for (const key of ['name', 'description', 'servings', 'prep_time', 'cook_time', 'cuisine', 'difficulty', 'image_url', 'source_url', 'notes', 'is_favorite', 'region']) {
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

  // ─── Soft delete recipe ───
  router.delete('/api/recipes/:id', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);
    db.prepare('UPDATE recipes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ─── Restore soft-deleted recipe ───
  router.post('/api/recipes/:id/restore', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Deleted recipe', req.params.id);
    db.prepare('UPDATE recipes SET deleted_at = NULL WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ─── Permanent delete ───
  router.delete('/api/recipes/:id/permanent', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Deleted recipe', req.params.id);
    db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
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

  // ─── Recipe version history ───
  router.get('/api/recipes/:id/history', (req, res) => {
    const recipe = db.prepare('SELECT id FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);

    const versions = db.prepare('SELECT * FROM recipe_versions WHERE recipe_id = ? ORDER BY version')
      .all(req.params.id);
    res.json(versions);
  });

  // ─── Revert to version ───
  router.post('/api/recipes/:id/revert/:versionId', (req, res) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);

    const version = db.prepare('SELECT * FROM recipe_versions WHERE id = ? AND recipe_id = ?')
      .get(req.params.versionId, req.params.id);
    if (!version) throw new NotFoundError('Version', req.params.versionId);

    const data = JSON.parse(version.data_json);
    const restoreFields = ['name', 'description', 'servings', 'prep_time', 'cook_time', 'cuisine', 'difficulty', 'image_url', 'source_url', 'notes', 'region', 'is_favorite'];
    const sets = [];
    const vals = [];
    for (const key of restoreFields) {
      if (data[key] !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(data[key]);
      }
    }
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(req.params.id, req.userId);

    // Workaround: drop and recreate FTS triggers to avoid SQLITE_CORRUPT_VTAB
    // The content-synced FTS can become corrupt after rapid sequential updates
    try {
      db.exec('DROP TRIGGER IF EXISTS recipes_au');
      db.prepare(`UPDATE recipes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
      db.exec(`CREATE TRIGGER recipes_au AFTER UPDATE ON recipes BEGIN
        INSERT INTO recipes_fts(recipes_fts, rowid, name, description, cuisine, region, notes)
        VALUES('delete', old.id, old.name, old.description, old.cuisine, old.region, old.notes);
        INSERT INTO recipes_fts(rowid, name, description, cuisine, region, notes)
        VALUES (new.id, new.name, new.description, new.cuisine, new.region, new.notes);
      END`);
      db.exec("INSERT INTO recipes_fts(recipes_fts) VALUES('rebuild')");
    } catch {
      // Fallback: just do the update without FTS
      db.prepare(`UPDATE recipes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    }

    const updated = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    res.json(enrichRecipe(updated));
  });

  // ─── Upload recipe image ───
  router.post('/api/recipes/:id/image', (req, res, next) => {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', req.params.id);

    upload.single('image')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Image must be under 2MB', code: 'VALIDATION_ERROR' });
        }
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, code: err.code });
        }
        return next(err);
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided', code: 'VALIDATION_ERROR' });
      }

      const imageUrl = `/images/${req.file.filename}`;
      db.prepare('UPDATE recipes SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(imageUrl, req.params.id);
      res.json({ image_url: imageUrl });
    });
  });

  return router;
};
