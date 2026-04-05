const { Router } = require('express');

module.exports = function nutritionRoutes({ db, enrichRecipe }) {
  const router = Router();

  // ─── Get nutrition log for a date range ───
  router.get('/api/nutrition', (req, res) => {
    const { from, to } = req.query;
    let sql = 'SELECT * FROM nutrition_log WHERE user_id = ?';
    const params = [req.userId];

    if (from) { sql += ' AND date >= ?'; params.push(from); }
    if (to) { sql += ' AND date <= ?'; params.push(to); }

    sql += ' ORDER BY date DESC, created_at DESC';
    res.json(db.prepare(sql).all(...params));
  });

  // ─── Log a nutrition entry ───
  router.post('/api/nutrition', (req, res) => {
    const { date, meal_type, recipe_id, custom_name, servings, calories, protein, carbs, fat } = req.body;
    if (!date || !meal_type) return res.status(400).json({ error: 'date and meal_type required' });

    let cal = calories || 0, prot = protein || 0, carb = carbs || 0, f = fat || 0;

    // Auto-calculate from recipe if provided
    if (recipe_id && !calories) {
      const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(recipe_id, req.userId);
      if (recipe) {
        const enriched = enrichRecipe(recipe);
        const factor = servings || 1;
        cal = (enriched.nutrition.calories || 0) * factor;
        prot = (enriched.nutrition.protein || 0) * factor;
        carb = (enriched.nutrition.carbs || 0) * factor;
        f = (enriched.nutrition.fat || 0) * factor;
      }
    }

    const result = db.prepare(`
      INSERT INTO nutrition_log (user_id, date, meal_type, recipe_id, custom_name, servings, calories, protein, carbs, fat)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId, date, meal_type, recipe_id || null, custom_name || '', servings || 1, cal, prot, carb, f);

    const entry = db.prepare('SELECT * FROM nutrition_log WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(entry);
  });

  // ─── Delete nutrition entry ───
  router.delete('/api/nutrition/:id', (req, res) => {
    const entry = db.prepare('SELECT * FROM nutrition_log WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    db.prepare('DELETE FROM nutrition_log WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ─── Get/set nutrition goals ───
  router.get('/api/nutrition/goals', (req, res) => {
    const goals = db.prepare('SELECT * FROM nutrition_goals WHERE user_id = ?').get(req.userId);
    res.json(goals || { calories_target: 2000, protein_target: 50, carbs_target: 250, fat_target: 65 });
  });

  router.put('/api/nutrition/goals', (req, res) => {
    const { calories_target, protein_target, carbs_target, fat_target } = req.body;
    const existing = db.prepare('SELECT * FROM nutrition_goals WHERE user_id = ?').get(req.userId);

    if (existing) {
      db.prepare('UPDATE nutrition_goals SET calories_target=?, protein_target=?, carbs_target=?, fat_target=? WHERE user_id=?')
        .run(calories_target || 2000, protein_target || 50, carbs_target || 250, fat_target || 65, req.userId);
    } else {
      db.prepare('INSERT INTO nutrition_goals (user_id, calories_target, protein_target, carbs_target, fat_target) VALUES (?, ?, ?, ?, ?)')
        .run(req.userId, calories_target || 2000, protein_target || 50, carbs_target || 250, fat_target || 65);
    }

    const goals = db.prepare('SELECT * FROM nutrition_goals WHERE user_id = ?').get(req.userId);
    res.json(goals);
  });

  // ─── Daily summary ───
  router.get('/api/nutrition/summary/:date', (req, res) => {
    const entries = db.prepare('SELECT * FROM nutrition_log WHERE user_id = ? AND date = ?').all(req.userId, req.params.date);
    const goals = db.prepare('SELECT * FROM nutrition_goals WHERE user_id = ?').get(req.userId) || {
      calories_target: 2000, protein_target: 50, carbs_target: 250, fat_target: 65
    };

    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const byMeal = {};

    for (const entry of entries) {
      totals.calories += entry.calories || 0;
      totals.protein += entry.protein || 0;
      totals.carbs += entry.carbs || 0;
      totals.fat += entry.fat || 0;

      if (!byMeal[entry.meal_type]) byMeal[entry.meal_type] = { calories: 0, protein: 0, carbs: 0, fat: 0, items: [] };
      byMeal[entry.meal_type].calories += entry.calories || 0;
      byMeal[entry.meal_type].protein += entry.protein || 0;
      byMeal[entry.meal_type].carbs += entry.carbs || 0;
      byMeal[entry.meal_type].fat += entry.fat || 0;
      byMeal[entry.meal_type].items.push(entry);
    }

    res.json({
      date: req.params.date,
      totals,
      goals,
      progress: {
        calories: Math.round((totals.calories / goals.calories_target) * 100),
        protein: Math.round((totals.protein / goals.protein_target) * 100),
        carbs: Math.round((totals.carbs / goals.carbs_target) * 100),
        fat: Math.round((totals.fat / goals.fat_target) * 100),
      },
      by_meal: byMeal,
    });
  });

  return router;
};
