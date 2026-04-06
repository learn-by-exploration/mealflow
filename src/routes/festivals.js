const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { setPersonFestivals } = require('../schemas/festivals.schema');
const { NotFoundError } = require('../errors');

module.exports = function festivalRoutes({ db }) {
  const router = Router();

  // ─── Helper: get user's household_id ───
  function getUserHouseholdId(userId) {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId);
    return user ? user.household_id : null;
  }

  // ─── List all festivals ───
  router.get('/api/festivals', (req, res) => {
    const { type, month } = req.query;
    let sql = 'SELECT * FROM festivals WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (month) {
      // Filter by month: parse date_rule JSON to find dates matching the month
      // We do this in JS since SQLite JSON support is limited
      const festivals = db.prepare(sql + ' ORDER BY name').all(...params);
      const monthNum = parseInt(month, 10);
      const filtered = festivals.filter(f => {
        try {
          const rule = JSON.parse(f.date_rule);
          if (rule.dates) {
            return Object.values(rule.dates).some(dateStr => {
              const d = new Date(dateStr);
              return d.getMonth() + 1 === monthNum;
            });
          }
        } catch {}
        return false;
      });
      return res.json(filtered);
    }

    sql += ' ORDER BY name';
    const festivals = db.prepare(sql).all(...params);
    res.json(festivals);
  });

  // ─── Upcoming festivals (next 30 days) ───
  router.get('/api/festivals/upcoming', (req, res) => {
    const festivals = db.prepare('SELECT * FROM festivals ORDER BY name').all();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 30);
    const year = String(today.getFullYear());

    const upcoming = festivals.filter(f => {
      try {
        const rule = JSON.parse(f.date_rule);
        if (rule.dates && rule.dates[year]) {
          const startDate = new Date(rule.dates[year] + 'T00:00:00');
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + (f.duration_days || 1));
          // Festival is upcoming if it starts within 30 days or is currently active
          return (startDate >= today && startDate <= cutoff) || (startDate <= today && endDate > today);
        }
      } catch {}
      return false;
    });

    res.json(upcoming);
  });

  // ─── DE-11: Festival meal compliance report (by date query param) ───
  router.get('/api/festivals/compliance', (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query parameter required', code: 'VALIDATION_ERROR' });

    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) {
      return res.json({ compliant: true, violations: [], date });
    }

    const persons = db.prepare('SELECT * FROM persons WHERE household_id = ? AND is_active = 1').all(householdId);
    const violations = [];

    for (const person of persons) {
      const observedFestivals = db.prepare(`
        SELECT f.* FROM festivals f
        JOIN person_festivals pf ON pf.festival_id = f.id
        WHERE pf.person_id = ? AND f.is_fasting = 1
      `).all(person.id);

      for (const fest of observedFestivals) {
        if (!isFestivalActiveOnDate(fest, date)) continue;

        const rules = db.prepare('SELECT * FROM fasting_rules WHERE festival_id = ?').all(fest.id);
        const denyRules = rules.filter(r => r.rule_type === 'deny');
        const allowRules = rules.filter(r => r.rule_type === 'allow');

        const items = db.prepare(`
          SELECT mpi.*, r.name AS recipe_name
          FROM meal_plan_items mpi
          JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
          JOIN person_assignments pa ON pa.meal_plan_item_id = mpi.id
          LEFT JOIN recipes r ON r.id = mpi.recipe_id
          WHERE mp.date = ? AND mp.user_id = ? AND pa.person_id = ?
        `).all(date, req.userId, person.id);

        for (const item of items) {
          if (!item.recipe_id) continue;
          const ingredients = db.prepare(`
            SELECT i.* FROM ingredients i
            JOIN recipe_ingredients ri ON ri.ingredient_id = i.id
            WHERE ri.recipe_id = ?
          `).all(item.recipe_id);

          for (const ing of ingredients) {
            const violation = checkIngredientViolation(ing, denyRules, allowRules, person, fest, item);
            if (violation) violations.push(violation);
          }
        }
      }
    }

    res.json({ compliant: violations.length === 0, violations, date });
  });

  // ─── Single festival with fasting rules and recipes ───
  router.get('/api/festivals/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    // Guard against matching 'upcoming' as :id
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid festival id' });

    const festival = db.prepare('SELECT * FROM festivals WHERE id = ?').get(id);
    if (!festival) throw new NotFoundError('Festival', id);

    festival.fasting_rules = db.prepare('SELECT * FROM fasting_rules WHERE festival_id = ?').all(id);
    festival.recipes = db.prepare(`
      SELECT r.* FROM recipes r
      JOIN festival_recipes fr ON fr.recipe_id = r.id
      WHERE fr.festival_id = ?
    `).all(id);

    res.json(festival);
  });

  // ─── Recipes linked to a festival ───
  router.get('/api/festivals/:id/recipes', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const festival = db.prepare('SELECT id FROM festivals WHERE id = ?').get(id);
    if (!festival) throw new NotFoundError('Festival', id);

    const recipes = db.prepare(`
      SELECT r.* FROM recipes r
      JOIN festival_recipes fr ON fr.recipe_id = r.id
      WHERE fr.festival_id = ?
    `).all(id);

    res.json(recipes);
  });

  // ─── Set person festivals ───
  router.put('/api/persons/:id/festivals', validate(setPersonFestivals), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const personId = parseInt(req.params.id, 10);
    const person = db.prepare('SELECT * FROM persons WHERE id = ? AND household_id = ?').get(personId, householdId);
    if (!person) throw new NotFoundError('Person', personId);

    const { festival_ids } = req.body;

    db.transaction(() => {
      db.prepare('DELETE FROM person_festivals WHERE person_id = ?').run(personId);
      const insert = db.prepare('INSERT INTO person_festivals (person_id, festival_id) VALUES (?, ?)');
      for (const fid of festival_ids) {
        insert.run(personId, fid);
      }
    })();

    res.json({ ok: true, person_id: personId, festival_count: festival_ids.length });
  });

  // ─── Meal compliance check ───
  router.get('/api/meals/:date/compliance', (req, res) => {
    const date = req.params.date;
    const householdId = getUserHouseholdId(req.userId);

    if (!householdId) {
      return res.json({ compliant: true, violations: [] });
    }

    // Get all persons in user's household
    const persons = db.prepare('SELECT * FROM persons WHERE household_id = ? AND is_active = 1').all(householdId);
    const violations = [];

    for (const person of persons) {
      // Get festivals this person observes
      const observedFestivals = db.prepare(`
        SELECT f.* FROM festivals f
        JOIN person_festivals pf ON pf.festival_id = f.id
        WHERE pf.person_id = ? AND f.is_fasting = 1
      `).all(person.id);

      // Check which festivals are active on this date
      for (const fest of observedFestivals) {
        if (!isFestivalActiveOnDate(fest, date)) continue;

        // Get fasting rules for this festival
        const rules = db.prepare('SELECT * FROM fasting_rules WHERE festival_id = ?').all(fest.id);
        const denyRules = rules.filter(r => r.rule_type === 'deny');
        const allowRules = rules.filter(r => r.rule_type === 'allow');

        // Get meal plan items assigned to this person on this date
        const items = db.prepare(`
          SELECT mpi.*, r.name AS recipe_name
          FROM meal_plan_items mpi
          JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
          JOIN person_assignments pa ON pa.meal_plan_item_id = mpi.id
          LEFT JOIN recipes r ON r.id = mpi.recipe_id
          WHERE mp.date = ? AND mp.user_id = ? AND pa.person_id = ?
        `).all(date, req.userId, person.id);

        for (const item of items) {
          if (!item.recipe_id) continue;

          // Get recipe ingredients
          const ingredients = db.prepare(`
            SELECT i.* FROM ingredients i
            JOIN recipe_ingredients ri ON ri.ingredient_id = i.id
            WHERE ri.recipe_id = ?
          `).all(item.recipe_id);

          for (const ing of ingredients) {
            const violation = checkIngredientViolation(ing, denyRules, allowRules, person, fest, item);
            if (violation) violations.push(violation);
          }
        }
      }
    }

    res.json({ compliant: violations.length === 0, violations });
  });

  return router;
};

/**
 * Check if a festival is active on a given date
 */
function isFestivalActiveOnDate(festival, dateStr) {
  try {
    const rule = JSON.parse(festival.date_rule);
    if (!rule.dates) return false;

    const checkDate = new Date(dateStr + 'T00:00:00');
    const year = String(checkDate.getFullYear());

    if (!rule.dates[year]) return false;

    const startDate = new Date(rule.dates[year] + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (festival.duration_days || 1));

    return checkDate >= startDate && checkDate < endDate;
  } catch {
    return false;
  }
}

/**
 * Check if an ingredient violates fasting rules.
 * Returns a violation object or null.
 */
function checkIngredientViolation(ingredient, denyRules, allowRules, person, festival, item) {
  // Check if ingredient is specifically allowed by name
  const allowedByName = allowRules.some(r => r.ingredient_name && r.ingredient_name === ingredient.name);
  if (allowedByName) return null;

  // Check deny rules
  for (const rule of denyRules) {
    let matches = false;

    if (rule.ingredient_name && rule.ingredient_name === ingredient.name) {
      matches = true;
    } else if (rule.category && rule.category === ingredient.category) {
      // Check if ingredient's category is allowed
      const categoryAllowed = allowRules.some(r => r.category && r.category === ingredient.category);
      if (categoryAllowed) continue;
      matches = true;
    }

    if (matches) {
      return {
        person_name: person.name,
        festival_name: festival.name,
        item_name: item.recipe_name || `Item #${item.id}`,
        ingredient_name: ingredient.name,
        rule: `${rule.rule_type}: ${rule.category || rule.ingredient_name}`,
      };
    }
  }

  return null;
}
