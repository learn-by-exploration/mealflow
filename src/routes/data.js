const { Router } = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function dataRoutes({ db, dbDir }) {
  const router = Router();

  // ─── Export all data ───
  router.get('/api/data/export', (req, res) => {
    const format = req.query.format || 'json';

    if (format !== 'json' && format !== 'csv') {
      return res.status(400).json({ error: 'Supported formats: json, csv', code: 'VALIDATION_ERROR' });
    }

    const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(req.userId);
    const ingredients = db.prepare('SELECT * FROM ingredients WHERE user_id = ?').all(req.userId);

    if (format === 'csv') {
      const sections = [];

      // Recipes CSV
      sections.push('--- RECIPES ---');
      if (recipes.length > 0) {
        const recipeKeys = Object.keys(recipes[0]);
        sections.push(recipeKeys.map(k => csvEscape(k)).join(','));
        for (const r of recipes) {
          sections.push(recipeKeys.map(k => csvEscape(String(r[k] ?? ''))).join(','));
        }
      }

      sections.push('');
      sections.push('--- INGREDIENTS ---');
      if (ingredients.length > 0) {
        const ingKeys = Object.keys(ingredients[0]);
        sections.push(ingKeys.map(k => csvEscape(k)).join(','));
        for (const i of ingredients) {
          sections.push(ingKeys.map(k => csvEscape(String(i[k] ?? ''))).join(','));
        }
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="mealflow-export.csv"');
      return res.send(sections.join('\n'));
    }

    // JSON format (default — original behavior)
    const data = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      recipes,
      ingredients,
      recipe_ingredients: db.prepare(`
        SELECT ri.* FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id WHERE r.user_id = ?
      `).all(req.userId),
      tags: db.prepare('SELECT * FROM tags WHERE user_id = ?').all(req.userId),
      recipe_tags: db.prepare(`
        SELECT rt.* FROM recipe_tags rt JOIN recipes r ON r.id = rt.recipe_id WHERE r.user_id = ?
      `).all(req.userId),
      meal_plans: db.prepare('SELECT * FROM meal_plans WHERE user_id = ?').all(req.userId),
      meal_plan_items: db.prepare(`
        SELECT mpi.* FROM meal_plan_items mpi JOIN meal_plans mp ON mp.id = mpi.meal_plan_id WHERE mp.user_id = ?
      `).all(req.userId),
      shopping_lists: db.prepare('SELECT * FROM shopping_lists WHERE user_id = ?').all(req.userId),
      shopping_list_items: db.prepare(`
        SELECT sli.* FROM shopping_list_items sli JOIN shopping_lists sl ON sl.id = sli.list_id WHERE sl.user_id = ?
      `).all(req.userId),
      nutrition_log: db.prepare('SELECT * FROM nutrition_log WHERE user_id = ?').all(req.userId),
      nutrition_goals: db.prepare('SELECT * FROM nutrition_goals WHERE user_id = ?').get(req.userId),
      settings: db.prepare('SELECT * FROM settings WHERE user_id = ?').all(req.userId),
    };
    res.json(data);
  });

  // ─── Backup ───
  router.post('/api/data/backup', (req, res) => {
    try {
      const backupDir = path.join(dbDir, '..', 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `mealflow-backup-${timestamp}.db`);
      db.backup(backupPath);
      res.json({ ok: true, path: backupPath });
    } catch (err) {
      res.status(500).json({ error: 'Backup failed: ' + err.message });
    }
  });

  return router;
};

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
