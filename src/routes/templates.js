const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createTemplate, applyTemplate } = require('../schemas/templates.schema');
const { NotFoundError } = require('../errors');

module.exports = function templateRoutes({ db }) {
  const router = Router();

  // ─── Helper: get user's household_id ───
  function getUserHouseholdId(userId) {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId);
    return user ? user.household_id : null;
  }

  // ─── List templates ───
  router.get('/api/templates', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.json([]);

    const templates = db.prepare('SELECT * FROM meal_templates WHERE household_id = ? ORDER BY created_at DESC').all(householdId);
    res.json(templates);
  });

  // ─── Save current meal plan date range as template ───
  router.post('/api/templates', validate(createTemplate), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const { name, description, start_date, end_date } = req.body;

    // Validate end_date >= start_date
    if (end_date < start_date) return res.status(400).json({ error: 'end_date must be >= start_date' });

    const [sy, sm, sd] = start_date.split('-').map(Number);
    const [ey, em, ed] = end_date.split('-').map(Number);
    const startMs = Date.UTC(sy, sm - 1, sd);
    const endMs = Date.UTC(ey, em - 1, ed);
    const durationDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;

    // Get meal plans in range
    const plans = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date, meal_type').all(req.userId, start_date, end_date);

    const template = db.transaction(() => {
      const r = db.prepare('INSERT INTO meal_templates (household_id, name, description, duration_days) VALUES (?,?,?,?)').run(
        householdId, name, description || '', durationDays
      );
      const templateId = r.lastInsertRowid;

      const itemStmt = db.prepare('INSERT INTO meal_template_items (template_id, day_offset, meal_type, recipe_id, custom_name, person_ids, servings, position) VALUES (?,?,?,?,?,?,?,?)');

      for (const plan of plans) {
        const [py, pm, pd] = plan.date.split('-').map(Number);
        const planMs = Date.UTC(py, pm - 1, pd);
        const dayOffset = Math.round((planMs - startMs) / (1000 * 60 * 60 * 24));

        const items = db.prepare('SELECT * FROM meal_plan_items WHERE meal_plan_id = ? ORDER BY position').all(plan.id);
        for (const item of items) {
          // Gather person assignment IDs
          const assignments = db.prepare('SELECT person_id FROM person_assignments WHERE meal_plan_item_id = ?').all(item.id);
          const personIds = JSON.stringify(assignments.map(a => a.person_id));

          itemStmt.run(templateId, dayOffset, plan.meal_type, item.recipe_id || null, item.custom_name || '', personIds, item.servings || 1, item.position);
        }
      }

      const created = db.prepare('SELECT * FROM meal_templates WHERE id = ?').get(templateId);
      created.items = db.prepare('SELECT * FROM meal_template_items WHERE template_id = ? ORDER BY day_offset, position').all(templateId);
      return created;
    })();

    res.status(201).json(template);
  });

  // ─── Template detail with items ───
  router.get('/api/templates/:id', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const template = db.prepare('SELECT * FROM meal_templates WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!template) throw new NotFoundError('Template', req.params.id);

    template.items = db.prepare(`
      SELECT mti.*, r.name AS recipe_name
      FROM meal_template_items mti
      LEFT JOIN recipes r ON r.id = mti.recipe_id
      WHERE mti.template_id = ?
      ORDER BY mti.day_offset, mti.position
    `).all(template.id);

    res.json(template);
  });

  // ─── Apply template to new start_date ───
  router.post('/api/templates/:id/apply', validate(applyTemplate), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const template = db.prepare('SELECT * FROM meal_templates WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!template) throw new NotFoundError('Template', req.params.id);

    const { start_date } = req.body;

    const items = db.prepare('SELECT * FROM meal_template_items WHERE template_id = ? ORDER BY day_offset, position').all(template.id);

    let plansCreated = 0;
    let itemsCreated = 0;

    // Helper to add days to a YYYY-MM-DD string without timezone issues
    function addDays(dateStr, days) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + days));
      return dt.toISOString().split('T')[0];
    }

    db.transaction(() => {
      for (const item of items) {
        const dateStr = addDays(start_date, item.day_offset);

        // Create or get meal plan
        let plan = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?').get(req.userId, dateStr, item.meal_type);
        if (!plan) {
          const r = db.prepare('INSERT INTO meal_plans (user_id, date, meal_type) VALUES (?,?,?)').run(req.userId, dateStr, item.meal_type);
          plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(r.lastInsertRowid);
          plansCreated++;
        }

        // Add item
        const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM meal_plan_items WHERE meal_plan_id = ?').get(plan.id).next;
        db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, custom_name, servings, position) VALUES (?,?,?,?,?)').run(
          plan.id, item.recipe_id || null, item.custom_name || '', item.servings || 1, maxPos
        );
        itemsCreated++;
      }
    })();

    res.json({ ok: true, plans_created: plansCreated, items_created: itemsCreated });
  });

  // ─── Delete template ───
  router.delete('/api/templates/:id', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const template = db.prepare('SELECT * FROM meal_templates WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!template) throw new NotFoundError('Template', req.params.id);

    db.prepare('DELETE FROM meal_templates WHERE id = ?').run(template.id);
    res.json({ ok: true });
  });

  return router;
};
