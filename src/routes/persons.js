const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createPerson, updatePerson, assignPerson } = require('../schemas/households.schema');
const { NotFoundError, ConflictError, ValidationError } = require('../errors');

module.exports = function personRoutes({ db, audit }) {
  const router = Router();

  // ─── Helper: get user's household_id ───
  function getUserHouseholdId(userId) {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId);
    return user ? user.household_id : null;
  }

  // ─── List persons in household ───
  router.get('/api/persons', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household. Create or join one first.' });

    const persons = db.prepare('SELECT * FROM persons WHERE household_id = ? AND is_active = 1 ORDER BY name').all(householdId);
    // Parse restrictions JSON and add festival count
    for (const p of persons) {
      try { p.restrictions = JSON.parse(p.restrictions || '[]'); } catch { p.restrictions = []; }
      try {
        p.festival_count = db.prepare('SELECT COUNT(*) AS c FROM person_festivals WHERE person_id = ?').get(p.id).c;
      } catch { p.festival_count = 0; }
    }
    res.json(persons);
  });

  // ─── Create person ───
  router.post('/api/persons', validate(createPerson), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household. Create or join one first.' });

    const data = req.body;
    const restrictions = JSON.stringify(data.restrictions || []);

    const result = db.prepare(`
      INSERT INTO persons (household_id, name, avatar_emoji, dietary_type, restrictions, age_group, spice_level, sugar_level, calorie_target, protein_target, carbs_target, fat_target)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      householdId, data.name, data.avatar_emoji, data.dietary_type, restrictions,
      data.age_group, data.spice_level, data.sugar_level,
      data.calorie_target ?? null, data.protein_target ?? null, data.carbs_target ?? null, data.fat_target ?? null
    );

    const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(result.lastInsertRowid);
    try { person.restrictions = JSON.parse(person.restrictions || '[]'); } catch { person.restrictions = []; }
    if (audit) audit.log(req.userId, 'create', 'person', person.id, req);
    res.status(201).json(person);
  });

  // ─── Update person ───
  router.put('/api/persons/:id', validate(updatePerson), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const person = db.prepare('SELECT * FROM persons WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!person) throw new NotFoundError('Person', req.params.id);

    const data = req.body;
    const fields = [];
    const values = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.avatar_emoji !== undefined) { fields.push('avatar_emoji = ?'); values.push(data.avatar_emoji); }
    if (data.dietary_type !== undefined) { fields.push('dietary_type = ?'); values.push(data.dietary_type); }
    if (data.restrictions !== undefined) { fields.push('restrictions = ?'); values.push(JSON.stringify(data.restrictions)); }
    if (data.age_group !== undefined) { fields.push('age_group = ?'); values.push(data.age_group); }
    if (data.spice_level !== undefined) { fields.push('spice_level = ?'); values.push(data.spice_level); }
    if (data.sugar_level !== undefined) { fields.push('sugar_level = ?'); values.push(data.sugar_level); }
    if (data.calorie_target !== undefined) { fields.push('calorie_target = ?'); values.push(data.calorie_target); }
    if (data.protein_target !== undefined) { fields.push('protein_target = ?'); values.push(data.protein_target); }
    if (data.carbs_target !== undefined) { fields.push('carbs_target = ?'); values.push(data.carbs_target); }
    if (data.fat_target !== undefined) { fields.push('fat_target = ?'); values.push(data.fat_target); }

    if (fields.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE persons SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id);
    try { updated.restrictions = JSON.parse(updated.restrictions || '[]'); } catch { updated.restrictions = []; }
    if (audit) audit.log(req.userId, 'update', 'person', updated.id, req);
    res.json(updated);
  });

  // ─── Delete person ───
  router.delete('/api/persons/:id', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const person = db.prepare('SELECT * FROM persons WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!person) throw new NotFoundError('Person', req.params.id);

    db.prepare('DELETE FROM persons WHERE id = ?').run(req.params.id);
    if (audit) audit.log(req.userId, 'delete', 'person', person.id, req);
    res.json({ ok: true });
  });

  // ─── Assign person to meal plan item ───
  router.post('/api/meals/items/:itemId/assign', validate(assignPerson), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const data = req.body;

    // Verify person belongs to user's household
    const person = db.prepare('SELECT * FROM persons WHERE id = ? AND household_id = ?').get(data.person_id, householdId);
    if (!person) throw new NotFoundError('Person', data.person_id);

    // Verify meal plan item exists and belongs to user
    const item = db.prepare(`
      SELECT mpi.* FROM meal_plan_items mpi
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE mpi.id = ? AND mp.user_id = ?
    `).get(req.params.itemId, req.userId);
    if (!item) throw new NotFoundError('Meal plan item', req.params.itemId);

    // Check for duplicate
    const existing = db.prepare('SELECT * FROM person_assignments WHERE meal_plan_item_id = ? AND person_id = ?').get(req.params.itemId, data.person_id);
    if (existing) throw new ConflictError('Person already assigned to this item');

    const result = db.prepare(
      'INSERT INTO person_assignments (meal_plan_item_id, person_id, servings, spice_override, sugar_override, notes) VALUES (?,?,?,?,?,?)'
    ).run(req.params.itemId, data.person_id, data.servings, data.spice_override ?? null, data.sugar_override ?? null, data.notes);

    const assignment = db.prepare('SELECT * FROM person_assignments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(assignment);
  });

  // ─── Unassign person from meal plan item ───
  router.delete('/api/meals/items/:itemId/assign/:personId', (req, res) => {
    // Verify meal plan item belongs to user
    const item = db.prepare(`
      SELECT mpi.* FROM meal_plan_items mpi
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE mpi.id = ? AND mp.user_id = ?
    `).get(req.params.itemId, req.userId);
    if (!item) throw new NotFoundError('Meal plan item', req.params.itemId);

    const assignment = db.prepare('SELECT * FROM person_assignments WHERE meal_plan_item_id = ? AND person_id = ?').get(req.params.itemId, req.params.personId);
    if (!assignment) throw new NotFoundError('Assignment');

    db.prepare('DELETE FROM person_assignments WHERE id = ?').run(assignment.id);
    res.json({ ok: true });
  });

  return router;
};
