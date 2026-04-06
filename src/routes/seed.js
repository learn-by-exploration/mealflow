const { Router } = require('express');
const { seedIngredients, seedRecipes, seedFestivals } = require('../../scripts/seed');

module.exports = function seedRoutes({ db }) {
  const router = Router();

  // Admin guard for all seed endpoints
  function requireAdmin(req, res, next) {
    const user = db.prepare('SELECT household_role FROM users WHERE id = ?').get(req.userId);
    if (!user || user.household_role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }
    next();
  }

  router.post('/api/seed/ingredients', requireAdmin, (req, res) => {
    const result = seedIngredients(db, req.userId);
    res.json(result);
  });

  router.post('/api/seed/recipes', requireAdmin, (req, res) => {
    const result = seedRecipes(db, req.userId);
    res.json(result);
  });

  router.post('/api/seed/festivals', requireAdmin, (req, res) => {
    const result = seedFestivals(db);
    res.json(result);
  });

  // ─── Seed a sample 7-day meal plan ───
  router.post('/api/seed/sample-plan', requireAdmin, (req, res) => {
    const recipes = db.prepare('SELECT id, name, meal_suitability FROM recipes WHERE user_id = ? ORDER BY RANDOM() LIMIT 30').all(req.userId);
    if (!recipes.length) {
      // Seed recipes first if none exist
      seedIngredients(db, req.userId);
      seedRecipes(db, req.userId);
      const fresh = db.prepare('SELECT id, name, meal_suitability FROM recipes WHERE user_id = ? ORDER BY RANDOM() LIMIT 30').all(req.userId);
      if (!fresh.length) return res.json({ created: 0 });
      recipes.length = 0;
      recipes.push(...fresh);
    }

    const mealTypes = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner'];
    const today = new Date();
    // Start from Monday of current week
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    let created = 0;
    const seedPlan = db.transaction(() => {
      // Group recipes by suitability for better matching
      const suitabilityMap = {};
      for (const mt of mealTypes) {
        suitabilityMap[mt] = recipes.filter(r => {
          try { return JSON.parse(r.meal_suitability || '[]').includes(mt); } catch { return false; }
        });
      }

      for (let d = 0; d < 7; d++) {
        const dateObj = new Date(monday);
        dateObj.setDate(monday.getDate() + d);
        const dateStr = dateObj.toISOString().split('T')[0];

        for (const mt of mealTypes) {
          // Skip if meal plan already exists for this date/type
          const existing = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?').get(req.userId, dateStr, mt);
          if (existing) continue;

          // Pick a recipe: strongly prefer meal_suitability match, rotate through matches
          const suitable = suitabilityMap[mt];
          let recipe;
          if (suitable.length > 0) {
            recipe = suitable[(d * mealTypes.indexOf(mt)) % suitable.length];
          } else {
            recipe = recipes[Math.floor(Math.random() * recipes.length)];
          }

          const plan = db.prepare('INSERT INTO meal_plans (user_id, date, meal_type) VALUES (?, ?, ?)').run(req.userId, dateStr, mt);
          db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?, ?, ?, 0)').run(plan.lastInsertRowid, recipe.id, 1);
          created++;
        }
      }
    });

    seedPlan();
    res.json({ created });
  });

  return router;
};
