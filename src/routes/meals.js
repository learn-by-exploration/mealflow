const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createMealPlan, addMealPlanItem } = require('../schemas/meals.schema');
const { createRecurrence, expandRecurrence } = require('../schemas/recurrence.schema');
const { NotFoundError } = require('../errors');

module.exports = function mealsRoutes({ db, enrichRecipe }) {
  const router = Router();

  // ─── Set recurrence rule ───
  router.post('/api/meals/items/:itemId/recurrence', validate(createRecurrence), (req, res) => {
    const item = db.prepare(`
      SELECT mpi.* FROM meal_plan_items mpi
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE mpi.id = ? AND mp.user_id = ?
    `).get(req.params.itemId, req.userId);
    if (!item) throw new NotFoundError('Meal plan item', req.params.itemId);

    const { pattern, days_of_week, start_date, end_date } = req.body;
    const dowStr = JSON.stringify(days_of_week || []);

    // Remove existing recurrence for this item
    db.prepare('DELETE FROM recurrence_rules WHERE meal_plan_item_id = ?').run(item.id);

    const r = db.prepare(
      'INSERT INTO recurrence_rules (meal_plan_item_id, pattern, days_of_week, start_date, end_date) VALUES (?,?,?,?,?)'
    ).run(item.id, pattern, dowStr, start_date, end_date || null);

    const rule = db.prepare('SELECT * FROM recurrence_rules WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(rule);
  });

  // ─── Remove recurrence rule ───
  router.delete('/api/meals/items/:itemId/recurrence', (req, res) => {
    const item = db.prepare(`
      SELECT mpi.* FROM meal_plan_items mpi
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE mpi.id = ? AND mp.user_id = ?
    `).get(req.params.itemId, req.userId);
    if (!item) throw new NotFoundError('Meal plan item', req.params.itemId);

    db.prepare('DELETE FROM recurrence_rules WHERE meal_plan_item_id = ?').run(item.id);
    res.json({ ok: true });
  });

  // ─── Expand recurrences ───
  router.post('/api/meals/recurrence/expand', validate(expandRecurrence), (req, res) => {
    const { from_date, to_date } = req.body;

    // Get all recurrence rules for this user's items
    const rules = db.prepare(`
      SELECT rr.*, mpi.recipe_id, mpi.custom_name, mpi.servings, mp.meal_type, mp.date AS original_date
      FROM recurrence_rules rr
      JOIN meal_plan_items mpi ON mpi.id = rr.meal_plan_item_id
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE mp.user_id = ?
    `).all(req.userId);

    let itemsCreated = 0;

    for (const rule of rules) {
      // Determine effective date range
      const effStart = rule.start_date > from_date ? rule.start_date : from_date;
      const effEnd = rule.end_date && rule.end_date < to_date ? rule.end_date : to_date;

      const dates = generateDates(rule.pattern, rule.days_of_week, rule.original_date, effStart, effEnd);

      for (const dateStr of dates) {
        // Skip the original date (plan already exists for that item)
        if (dateStr === rule.original_date) continue;

        // Find or create meal plan for this date + meal_type
        let plan = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?')
          .get(req.userId, dateStr, rule.meal_type);
        if (!plan) {
          const pr = db.prepare('INSERT INTO meal_plans (user_id, date, meal_type) VALUES (?,?,?)')
            .run(req.userId, dateStr, rule.meal_type);
          plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(pr.lastInsertRowid);
        }

        // Add item
        const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM meal_plan_items WHERE meal_plan_id = ?').get(plan.id).next;
        db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, custom_name, servings, position) VALUES (?,?,?,?,?)')
          .run(plan.id, rule.recipe_id || null, rule.custom_name || '', rule.servings || 1, maxPos);
        itemsCreated++;
      }
    }

    res.json({ items_created: itemsCreated });
  });

  /**
   * Generate dates matching a recurrence pattern.
   */
  function generateDates(pattern, daysOfWeekStr, originalDate, startDate, endDate) {
    const dow = (() => { try { return JSON.parse(daysOfWeekStr); } catch { return []; } })();
    const dates = [];
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    const orig = new Date(originalDate + 'T12:00:00');

    const cursor = new Date(start);
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      switch (pattern) {
        case 'daily':
          dates.push(dateStr);
          break;
        case 'specific_days':
          if (dow.includes(cursor.getDay())) dates.push(dateStr);
          break;
        case 'weekly':
          if (cursor.getDay() === orig.getDay()) dates.push(dateStr);
          break;
        case 'biweekly': {
          if (cursor.getDay() === orig.getDay()) {
            const diffMs = cursor - orig;
            const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
            if (diffWeeks % 2 === 0) dates.push(dateStr);
          }
          break;
        }
        case 'monthly':
          if (cursor.getDate() === orig.getDate()) dates.push(dateStr);
          break;
      }

      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  // ─── Toggle leftover flag ───
  router.put('/api/meals/items/:id/leftover', (req, res) => {
    const item = db.prepare(`
      SELECT mpi.* FROM meal_plan_items mpi
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE mpi.id = ? AND mp.user_id = ?
    `).get(req.params.id, req.userId);
    if (!item) throw new NotFoundError('Meal plan item', req.params.id);

    const newVal = item.is_leftover ? 0 : 1;
    db.prepare('UPDATE meal_plan_items SET is_leftover = ? WHERE id = ?').run(newVal, item.id);
    res.json({ ...item, is_leftover: newVal });
  });

  // ─── Get recent leftovers (last 3 days) ───
  router.get('/api/meals/leftovers', (req, res) => {
    const items = db.prepare(`
      SELECT mpi.*, r.name AS recipe_name, mp.date, mp.meal_type
      FROM meal_plan_items mpi
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      LEFT JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mp.user_id = ? AND mpi.is_leftover = 1
        AND mp.date >= date('now', '-3 days')
      ORDER BY mp.date DESC
    `).all(req.userId);
    res.json(items);
  });

  // ─── Reuse a leftover in new meal slot ───
  router.post('/api/meals/items/:id/reuse', (req, res) => {
    const item = db.prepare(`
      SELECT mpi.* FROM meal_plan_items mpi
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE mpi.id = ? AND mp.user_id = ? AND mpi.is_leftover = 1
    `).get(req.params.id, req.userId);
    if (!item) throw new NotFoundError('Leftover item', req.params.id);

    const { meal_plan_id } = req.body;
    if (!meal_plan_id) return res.status(400).json({ error: 'meal_plan_id required' });

    const target = db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(meal_plan_id, req.userId);
    if (!target) throw new NotFoundError('Meal plan', meal_plan_id);

    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM meal_plan_items WHERE meal_plan_id = ?').get(target.id).next;
    const r = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, custom_name, servings, position, leftover_from_item_id) VALUES (?,?,?,?,?,?)').run(
      target.id, item.recipe_id || null, item.custom_name || '', item.servings || 1, maxPos, item.id
    );
    const created = db.prepare('SELECT * FROM meal_plan_items WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(created);
  });

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
    const { date, meal_type, notes } = req.body;
    const existing = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?').get(req.userId, date, meal_type);
    if (existing) return res.json(existing);

    const result = db.prepare('INSERT INTO meal_plans (user_id, date, meal_type, notes) VALUES (?, ?, ?, ?)').run(req.userId, date, meal_type, notes || '');
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(plan);
  });

  // ─── Update meal plan ───
  router.put('/api/meals/:id', (req, res) => {
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!plan) throw new NotFoundError('Meal plan', req.params.id);

    const { notes } = req.body;
    if (notes !== undefined) {
      db.prepare('UPDATE meal_plans SET notes = ? WHERE id = ?').run(notes, plan.id);
    }

    const updated = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(plan.id);
    res.json(updated);
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

  // ─── Bulk meal plan operations ───
  router.post('/api/meals/bulk', (req, res) => {
    const { meals } = req.body;
    if (!Array.isArray(meals) || meals.length === 0) {
      return res.status(400).json({ error: 'meals array required and must not be empty', code: 'VALIDATION_ERROR' });
    }

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const validMealTypes = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner', 'custom'];

    // Validate all entries first
    for (const m of meals) {
      if (!m.date || !dateRe.test(m.date)) {
        return res.status(400).json({ error: `Invalid date: ${m.date}`, code: 'VALIDATION_ERROR' });
      }
      if (!m.meal_type || !validMealTypes.includes(m.meal_type)) {
        return res.status(400).json({ error: `Invalid meal_type: ${m.meal_type}`, code: 'VALIDATION_ERROR' });
      }
    }

    const insertPlan = db.prepare('INSERT INTO meal_plans (user_id, date, meal_type) VALUES (?, ?, ?)');
    const insertItem = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, custom_name, servings, position) VALUES (?, ?, ?, ?, ?)');
    const findPlan = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?');

    const bulkInsert = db.transaction(() => {
      let created = 0;
      for (const m of meals) {
        let plan = findPlan.get(req.userId, m.date, m.meal_type);
        if (!plan) {
          const r = insertPlan.run(req.userId, m.date, m.meal_type);
          plan = { id: r.lastInsertRowid };
          created++;
        }
        if (m.items && m.items.length) {
          for (let i = 0; i < m.items.length; i++) {
            const item = m.items[i];
            insertItem.run(plan.id, item.recipe_id || null, item.custom_name || '', item.servings || 1, i);
          }
        }
      }
      return created;
    });

    const created = bulkInsert();
    res.status(201).json({ created });
  });

  // ─── IC-03: Thali completeness check ───
  router.get('/api/meals/:date/completeness', (req, res) => {
    const { date } = req.params;
    const { meal_type } = req.query;
    const type = meal_type || 'lunch';

    const { checkThaliCompleteness } = require('../services/thali');
    const result = checkThaliCompleteness(db, req.userId, date, type);
    res.json(result);
  });

  return router;
};
