const { Router } = require('express');

module.exports = function statsRoutes({ db }) {
  const router = Router();

  // ─── Dashboard stats ───
  router.get('/api/stats/dashboard', (req, res) => {
    const recipeCount = db.prepare('SELECT COUNT(*) AS c FROM recipes WHERE user_id = ?').get(req.userId).c;
    const ingredientCount = db.prepare('SELECT COUNT(*) AS c FROM ingredients WHERE user_id = ?').get(req.userId).c;
    const mealPlanCount = db.prepare('SELECT COUNT(*) AS c FROM meal_plans WHERE user_id = ?').get(req.userId).c;

    // This week's meal plans
    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekPlans = db.prepare('SELECT COUNT(*) AS c FROM meal_plans WHERE user_id = ? AND date >= ? AND date <= ?')
      .get(req.userId, weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]).c;

    // Favorite recipes
    const favoriteCount = db.prepare('SELECT COUNT(*) AS c FROM recipes WHERE user_id = ? AND is_favorite = 1').get(req.userId).c;

    // Top cuisines
    const topCuisines = db.prepare(`
      SELECT cuisine, COUNT(*) AS c FROM recipes WHERE user_id = ? AND cuisine != '' GROUP BY cuisine ORDER BY c DESC LIMIT 5
    `).all(req.userId);

    res.json({
      recipes: recipeCount,
      ingredients: ingredientCount,
      meal_plans: mealPlanCount,
      this_week_plans: weekPlans,
      favorites: favoriteCount,
      top_cuisines: topCuisines,
    });
  });

  // ─── Nutrition trends (weekly/monthly) ───
  router.get('/api/stats/nutrition', (req, res) => {
    const { days } = req.query;
    const limit = parseInt(days, 10) || 7;

    const data = db.prepare(`
      SELECT date,
        SUM(calories) AS calories, SUM(protein) AS protein,
        SUM(carbs) AS carbs, SUM(fat) AS fat
      FROM nutrition_log
      WHERE user_id = ? AND date >= date('now', ?)
      GROUP BY date ORDER BY date
    `).all(req.userId, `-${limit} days`);

    res.json(data);
  });

  // ─── Most used ingredients ───
  router.get('/api/stats/ingredients', (req, res) => {
    const topIngredients = db.prepare(`
      SELECT i.name, i.category, COUNT(*) AS usage_count
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      JOIN recipes r ON r.id = ri.recipe_id
      WHERE r.user_id = ?
      GROUP BY ri.ingredient_id
      ORDER BY usage_count DESC
      LIMIT 20
    `).all(req.userId);

    res.json(topIngredients);
  });

  return router;
};
