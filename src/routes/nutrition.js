const { Router } = require('express');

module.exports = function nutritionRoutes({ db, enrichRecipe, calcPersonDailyNutrition }) {
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
    const { date, meal_type, recipe_id, custom_name, servings, calories, protein, carbs, fat, person_id, iron, calcium } = req.body;
    if (!date || !meal_type) return res.status(400).json({ error: 'date and meal_type required' });

    let cal = calories || 0, prot = protein || 0, carb = carbs || 0, f = fat || 0;
    let ir = iron || 0, ca = calcium || 0;

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
      INSERT INTO nutrition_log (user_id, date, meal_type, recipe_id, custom_name, servings, calories, protein, carbs, fat, person_id, iron, calcium)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId, date, meal_type, recipe_id || null, custom_name || '', servings || 1, cal, prot, carb, f, person_id || null, ir, ca);

    const entry = db.prepare('SELECT * FROM nutrition_log WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(entry);
  });

  // ─── Per-person daily nutrition ───
  router.get('/api/nutrition/person/:personId/daily/:date', (req, res) => {
    const personId = Number(req.params.personId);
    const { date } = req.params;

    // Verify person belongs to user's household
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.household_id) return res.status(400).json({ error: 'No household' });
    const person = db.prepare('SELECT * FROM persons WHERE id = ? AND household_id = ?').get(personId, user.household_id);
    if (!person) return res.status(404).json({ error: 'Person not found in household' });

    const totals = calcPersonDailyNutrition(db, personId, date);

    res.json({
      person_id: personId,
      date,
      totals,
      targets: {
        calories: person.calorie_target,
        protein: person.protein_target,
        carbs: person.carbs_target,
        fat: person.fat_target,
      }
    });
  });

  // ─── Per-person weekly nutrition ───
  router.get('/api/nutrition/person/:personId/weekly/:startDate', (req, res) => {
    const personId = Number(req.params.personId);
    const { startDate } = req.params;

    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.household_id) return res.status(400).json({ error: 'No household' });
    const person = db.prepare('SELECT * FROM persons WHERE id = ? AND household_id = ?').get(personId, user.household_id);
    if (!person) return res.status(404).json({ error: 'Person not found in household' });

    const daily = [];
    const sumTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, iron: 0, calcium: 0 };

    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const totals = calcPersonDailyNutrition(db, personId, dateStr);
      daily.push({ date: dateStr, totals });
      for (const key of Object.keys(sumTotals)) {
        sumTotals[key] += totals[key];
      }
    }

    const averages = {};
    for (const key of Object.keys(sumTotals)) {
      averages[key] = Math.round(sumTotals[key] / 7 * 10) / 10;
    }

    res.json({
      person_id: personId,
      start_date: startDate,
      daily,
      averages,
      targets: {
        calories: person.calorie_target,
        protein: person.protein_target,
        carbs: person.carbs_target,
        fat: person.fat_target,
      }
    });
  });

  // ─── Household daily nutrition ───
  router.get('/api/nutrition/household/daily/:date', (req, res) => {
    const { date } = req.params;
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.household_id) return res.status(400).json({ error: 'No household' });

    const persons = db.prepare('SELECT * FROM persons WHERE household_id = ? AND is_active = 1').all(user.household_id);
    const result = persons.map(p => ({
      person_id: p.id,
      name: p.name,
      totals: calcPersonDailyNutrition(db, p.id, date),
      targets: {
        calories: p.calorie_target,
        protein: p.protein_target,
        carbs: p.carbs_target,
        fat: p.fat_target,
      }
    }));

    res.json({ date, persons: result });
  });

  // ─── Generate nutrition alerts ───
  router.post('/api/nutrition/alerts/generate', (req, res) => {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.household_id) return res.status(400).json({ error: 'No household' });

    const persons = db.prepare('SELECT * FROM persons WHERE household_id = ? AND is_active = 1').all(user.household_id);
    const today = new Date().toISOString().slice(0, 10);
    const alerts = [];

    for (const person of persons) {
      const targetMap = {
        calories: person.calorie_target,
        protein: person.protein_target,
        carbs: person.carbs_target,
        fat: person.fat_target,
      };

      // Sum nutrition for last 7 days
      const sumTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, iron: 0, calcium: 0 };
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const daily = calcPersonDailyNutrition(db, person.id, dateStr);
        for (const key of Object.keys(sumTotals)) {
          sumTotals[key] += daily[key];
        }
      }

      const avgTotals = {};
      for (const key of Object.keys(sumTotals)) {
        avgTotals[key] = sumTotals[key] / 7;
      }

      for (const [nutrient, target] of Object.entries(targetMap)) {
        if (!target || target <= 0) continue;
        const value = avgTotals[nutrient] || 0;
        const ratio = value / target;

        let alertType = null;
        if (ratio < 0.7) alertType = 'low';
        else if (ratio > 1.5) alertType = 'high';

        if (alertType) {
          // Idempotent: check if alert already exists for this person/nutrient/date
          const existing = db.prepare(
            'SELECT id FROM nutrition_alerts WHERE person_id = ? AND nutrient = ? AND date = ? AND alert_type = ?'
          ).get(person.id, nutrient, today, alertType);

          if (!existing) {
            const r = db.prepare(
              'INSERT INTO nutrition_alerts (person_id, nutrient, alert_type, period, value, target, date) VALUES (?,?,?,?,?,?,?)'
            ).run(person.id, nutrient, alertType, '7day_avg', Math.round(value * 10) / 10, target, today);
            const alert = db.prepare('SELECT * FROM nutrition_alerts WHERE id = ?').get(r.lastInsertRowid);
            alerts.push(alert);
          }
        }
      }
    }

    res.json({ alerts });
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

  // ─── CSV export for nutrition ───
  router.get('/api/nutrition/export', (req, res) => {
    const { format, start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end query parameters required', code: 'VALIDATION_ERROR' });

    const rows = db.prepare(
      'SELECT * FROM nutrition_log WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date, created_at'
    ).all(req.userId, start, end);

    if (format === 'csv') {
      const header = 'date,meal_type,custom_name,servings,calories,protein,carbs,fat';
      const lines = rows.map(r =>
        `${r.date},${r.meal_type},${(r.custom_name || '').replace(/,/g, ';')},${r.servings},${r.calories},${r.protein},${r.carbs},${r.fat}`
      );
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="nutrition.csv"');
      return res.send(csv);
    }

    res.json(rows);
  });

  return router;
};
