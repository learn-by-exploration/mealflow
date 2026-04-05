/**
 * Shared helper utilities for MealFlow.
 */

function createHelpers(db) {
  /**
   * Get the next position value for ordered items.
   */
  function getNextPosition(table, where = '', params = []) {
    const sql = `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table}${where ? ' WHERE ' + where : ''}`;
    return db.prepare(sql).get(...params).next;
  }

  /**
   * Enrich a recipe with its ingredients and tags.
   */
  function enrichRecipe(recipe) {
    if (!recipe) return recipe;
    recipe.ingredients = db.prepare(`
      SELECT ri.*, i.name AS ingredient_name, i.category AS ingredient_category,
             i.calories, i.protein, i.carbs, i.fat
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ?
      ORDER BY ri.position
    `).all(recipe.id);
    recipe.tags = db.prepare(`
      SELECT t.* FROM tags t
      JOIN recipe_tags rt ON rt.tag_id = t.id
      WHERE rt.recipe_id = ?
      ORDER BY t.name
    `).all(recipe.id);
    // Calculate total nutrition per serving
    recipe.nutrition = calcRecipeNutrition(recipe);
    return recipe;
  }

  function enrichRecipes(recipes) {
    return recipes.map(r => enrichRecipe(r));
  }

  /**
   * Calculate nutrition totals for a recipe based on ingredients.
   */
  function calcRecipeNutrition(recipe) {
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const ing of recipe.ingredients) {
      // Nutrition stored per 100g, quantity in grams
      const factor = (ing.quantity || 0) / 100;
      totals.calories += (ing.calories || 0) * factor;
      totals.protein += (ing.protein || 0) * factor;
      totals.carbs += (ing.carbs || 0) * factor;
      totals.fat += (ing.fat || 0) * factor;
    }
    const servings = recipe.servings || 1;
    return {
      calories: Math.round(totals.calories / servings),
      protein: Math.round(totals.protein * 10 / servings) / 10,
      carbs: Math.round(totals.carbs * 10 / servings) / 10,
      fat: Math.round(totals.fat * 10 / servings) / 10,
    };
  }

  /**
   * Calculate per-person daily nutrition from meal plan assignments.
   */
  function calcPersonDailyNutrition(db, personId, date) {
    const rows = db.prepare(`
      SELECT pa.servings AS pa_servings, mpi.recipe_id, mpi.servings AS item_servings
      FROM person_assignments pa
      JOIN meal_plan_items mpi ON mpi.id = pa.meal_plan_item_id
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE pa.person_id = ? AND mp.date = ?
    `).all(personId, date);

    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, iron: 0, calcium: 0 };

    for (const row of rows) {
      if (!row.recipe_id) continue;
      const ings = db.prepare(`
        SELECT ri.quantity, ri.unit, i.calories, i.protein, i.carbs, i.fat, i.iron, i.calcium
        FROM recipe_ingredients ri
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id = ?
      `).all(row.recipe_id);

      const recipe = db.prepare('SELECT servings FROM recipes WHERE id = ?').get(row.recipe_id);
      if (!recipe) continue;

      const servingFactor = (row.pa_servings || 1) / (recipe.servings || 1);

      for (const ing of ings) {
        const factor = (ing.quantity || 0) / 100 * servingFactor;
        totals.calories += (ing.calories || 0) * factor;
        totals.protein += (ing.protein || 0) * factor;
        totals.carbs += (ing.carbs || 0) * factor;
        totals.fat += (ing.fat || 0) * factor;
        totals.iron += (ing.iron || 0) * factor;
        totals.calcium += (ing.calcium || 0) * factor;
      }
    }

    for (const key of Object.keys(totals)) {
      totals[key] = Math.round(totals[key] * 10) / 10;
    }
    return totals;
  }

  return { getNextPosition, enrichRecipe, enrichRecipes, calcRecipeNutrition, calcPersonDailyNutrition };
}

module.exports = createHelpers;
