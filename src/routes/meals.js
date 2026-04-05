const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createMealPlan, addMealPlanItem } = require('../schemas/meals.schema');
const { NotFoundError } = require('../errors');

module.exports = function mealsRoutes({ db, enrichRecipe }) {
  const router = Router();

  // ─── Get meal plans for a date range ───
  router.get('/api/meals', (req, res) => {
    const { from, to } = req.query;
    let sql = 'SELECT * FROM meal_plans WHERE user_id = ?';
    const params = [req.userId];

    if (from) { sql += ' AND date >= ?'; params.push(from); }
    if (to) { sql += ' AND date <= ?'; params.push(to); }

    sql += ' ORDER BY date, CASE meal_type WHEN \'breakfast\' THEN 1 WHEN \'morning_snack\' THEN 2 WHEN \'lunch\' THEN 3 WHEN \'evening_snack\' THEN 4 WHEN \'dinner\' THEN 5 WHEN \'snack\' THEN 6 WHEN \'custom\' THEN 7 END';

    const plans = db.prepare(sql).all(...params);

    // Enrich with items and person assignments
    for (const plan of plans) {
      plan.items = db.prepare(`
        SELECT mpi.*, r.name AS recipe_name, r.servings AS recipe_servings,
               r.prep_time, r.cook_time, r.cuisine, r.image_url
        FROM meal_plan_items mpi
        LEFT JOIN recipes r ON r.id = mpi.recipe_id
        WHERE mpi.meal_plan_id = ?
        ORDER BY mpi.position
      `).all(plan.id);
      for (const item of plan.items) {
        item.assignments = db.prepare(`
          SELECT pa.*, p.name AS person_name
          FROM person_assignments pa
          LEFT JOIN persons p ON p.id = pa.person_id
          WHERE pa.meal_plan_item_id = ?
        `).all(item.id);
      }
    }

    res.json(plans);
  });

  // ─── Get meal plan for a specific date ───
  router.get('/api/meals/:date', (req, res) => {
    const plans = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND date = ? ORDER BY CASE meal_type WHEN \'breakfast\' THEN 1 WHEN \'morning_snack\' THEN 2 WHEN \'lunch\' THEN 3 WHEN \'evening_snack\' THEN 4 WHEN \'dinner\' THEN 5 WHEN \'snack\' THEN 6 WHEN \'custom\' THEN 7 END')
      .all(req.userId, req.params.date);

    for (const plan of plans) {
      plan.items = db.prepare(`
        SELECT mpi.*, r.name AS recipe_name, r.servings AS recipe_servings
        FROM meal_plan_items mpi
        LEFT JOIN recipes r ON r.id = mpi.recipe_id
        WHERE mpi.meal_plan_id = ?
        ORDER BY mpi.position
      `).all(plan.id);

      for (const item of plan.items) {
        item.assignments = db.prepare(`
          SELECT pa.*, p.name AS person_name
          FROM person_assignments pa
          LEFT JOIN persons p ON p.id = pa.person_id
          WHERE pa.meal_plan_item_id = ?
        `).all(item.id);
      }
    }

    // Calculate daily nutrition totals
    let totalNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const plan of plans) {
      for (const item of plan.items) {
        if (item.recipe_id) {
          const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(item.recipe_id);
          if (recipe) {
            const enriched = enrichRecipe(recipe);
            const factor = (item.servings || 1);
            totalNutrition.calories += (enriched.nutrition.calories || 0) * factor;
            totalNutrition.protein += (enriched.nutrition.protein || 0) * factor;
            totalNutrition.carbs += (enriched.nutrition.carbs || 0) * factor;
            totalNutrition.fat += (enriched.nutrition.fat || 0) * factor;
          }
        }
      }
    }

    res.json({ date: req.params.date, meals: plans, nutrition: totalNutrition });
  });

  // ─── Create/ensure meal plan slot ───
  router.post('/api/meals', validate(createMealPlan), (req, res) => {
    const { date, meal_type } = req.body;
    const existing = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?').get(req.userId, date, meal_type);
    if (existing) return res.json(existing);

    const result = db.prepare('INSERT INTO meal_plans (user_id, date, meal_type) VALUES (?, ?, ?)').run(req.userId, date, meal_type);
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(plan);
  });

  // ─── Add item to meal plan ───
  router.post('/api/meals/:id/items', validate(addMealPlanItem), (req, res) => {
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!plan) throw new NotFoundError('Meal plan', req.params.id);

    const data = req.body;
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM meal_plan_items WHERE meal_plan_id = ?').get(plan.id).next;

    const result = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, custom_name, servings, position) VALUES (?, ?, ?, ?, ?)')
      .run(plan.id, data.recipe_id || null, data.custom_name || '', data.servings || 1, maxPos);

    const item = db.prepare('SELECT * FROM meal_plan_items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  });

  // ─── Remove item from meal plan ───
  router.delete('/api/meals/:id/items/:itemId', (req, res) => {
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!plan) throw new NotFoundError('Meal plan', req.params.id);

    const item = db.prepare('SELECT * FROM meal_plan_items WHERE id = ? AND meal_plan_id = ?').get(req.params.itemId, plan.id);
    if (!item) throw new NotFoundError('Meal plan item', req.params.itemId);

    db.prepare('DELETE FROM meal_plan_items WHERE id = ?').run(req.params.itemId);
    res.json({ ok: true });
  });

  // ─── Delete meal plan ───
  router.delete('/api/meals/:id', (req, res) => {
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!plan) throw new NotFoundError('Meal plan', req.params.id);
    db.prepare('DELETE FROM meal_plans WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ─── Copy meal plan to another date ───
  router.post('/api/meals/:id/copy', (req, res) => {
    const { target_date } = req.body;
    if (!target_date) return res.status(400).json({ error: 'target_date required' });

    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!plan) throw new NotFoundError('Meal plan', req.params.id);

    // Create or get target plan
    let target = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?').get(req.userId, target_date, plan.meal_type);
    if (!target) {
      const r = db.prepare('INSERT INTO meal_plans (user_id, date, meal_type) VALUES (?, ?, ?)').run(req.userId, target_date, plan.meal_type);
      target = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(r.lastInsertRowid);
    }

    // Copy items
    const items = db.prepare('SELECT * FROM meal_plan_items WHERE meal_plan_id = ? ORDER BY position').all(plan.id);
    const stmt = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, custom_name, servings, position) VALUES (?, ?, ?, ?, ?)');
    const assignStmt = db.prepare('INSERT INTO person_assignments (meal_plan_item_id, person_id, servings, spice_override, sugar_override, notes) VALUES (?,?,?,?,?,?)');
    for (const item of items) {
      const r = stmt.run(target.id, item.recipe_id, item.custom_name, item.servings, item.position);
      // Copy person assignments
      const assignments = db.prepare('SELECT * FROM person_assignments WHERE meal_plan_item_id = ?').all(item.id);
      for (const a of assignments) {
        assignStmt.run(r.lastInsertRowid, a.person_id, a.servings, a.spice_override, a.sugar_override, a.notes);
      }
    }

    res.status(201).json(target);
  });

  return router;
};
