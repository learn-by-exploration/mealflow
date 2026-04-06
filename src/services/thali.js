/**
 * Thali composition rules service.
 * A complete Indian thali needs: dal/lentil + sabzi/vegetable + roti/rice + accompaniment (raita/chutney/pickle)
 */

const THALI_COMPONENTS = {
  dal: {
    label: 'dal',
    categories: ['pulses'],
    tags: ['dal', 'lentil', 'protein-rich'],
    namePatterns: ['dal', 'sambar', 'rasam', 'kadhi', 'rajma', 'chole', 'chana']
  },
  sabzi: {
    label: 'sabzi',
    categories: ['vegetables'],
    tags: ['sabzi', 'dry-sabzi', 'curry', 'vegetable'],
    namePatterns: ['sabzi', 'bhaji', 'gobi', 'palak', 'paneer', 'aloo', 'baingan', 'bhindi', 'matar']
  },
  roti_rice: {
    label: 'roti/rice',
    tags: ['bread', 'rice', 'roti', 'naan', 'paratha', 'chapati'],
    namePatterns: ['roti', 'rice', 'chawal', 'naan', 'paratha', 'chapati', 'puri', 'bhatura', 'phulka', 'kulcha', 'dosa', 'idli']
  },
  accompaniment: {
    label: 'accompaniment',
    tags: ['condiment', 'chutney', 'raita', 'pickle', 'papad', 'salad'],
    namePatterns: ['chutney', 'raita', 'achaar', 'pickle', 'papad', 'salad']
  }
};

/**
 * Classify a recipe into thali component type(s).
 * @param {object} recipe - Recipe with tags[], ingredients[], name
 * @returns {string[]} matching component keys
 */
function classifyRecipe(recipe) {
  const matches = [];
  const recipeName = (recipe.name || '').toLowerCase();
  const recipeTags = (recipe.tags || []).map(t => (typeof t === 'string' ? t : t.name || '').toLowerCase());
  const recipeCategory = (recipe.category || '').toLowerCase();

  for (const [key, comp] of Object.entries(THALI_COMPONENTS)) {
    // Check name patterns
    if (comp.namePatterns && comp.namePatterns.some(p => recipeName.includes(p))) {
      matches.push(key);
      continue;
    }
    // Check tags
    if (comp.tags && comp.tags.some(t => recipeTags.includes(t))) {
      matches.push(key);
      continue;
    }
    // Check category match
    if (recipeCategory === 'condiment' && key === 'accompaniment') {
      matches.push(key);
      continue;
    }
    // Check ingredient categories for dal detection
    if (key === 'dal' && recipe.ingredients) {
      const ingCategories = recipe.ingredients.map(i => (i.ingredient_category || '').toLowerCase());
      if (comp.categories && comp.categories.some(c => ingCategories.includes(c))) {
        // Only if the primary ingredient is a pulse (>30% of total weight)
        const pulseWeight = recipe.ingredients
          .filter(i => (i.ingredient_category || '').toLowerCase() === 'pulses')
          .reduce((sum, i) => sum + (i.quantity || 0), 0);
        const totalWeight = recipe.ingredients.reduce((sum, i) => sum + (i.quantity || 0), 0);
        if (totalWeight > 0 && pulseWeight / totalWeight > 0.3) {
          matches.push(key);
        }
      }
    }
  }

  return matches;
}

/**
 * Check if meals on a given date form a complete thali.
 * @param {object} db - Database instance
 * @param {number} userId - User ID
 * @param {string} date - Date string YYYY-MM-DD
 * @param {string} mealType - 'lunch' or 'dinner'
 * @returns {{ complete: boolean, missing: string[], suggestions: string[] }}
 */
function checkThaliCompleteness(db, userId, date, mealType) {
  const plans = db.prepare(`
    SELECT mp.id FROM meal_plans mp
    WHERE mp.user_id = ? AND mp.date = ? AND mp.meal_type = ?
  `).all(userId, date, mealType);

  if (plans.length === 0) {
    return {
      complete: false,
      missing: ['dal', 'sabzi', 'roti/rice', 'accompaniment'],
      suggestions: getSuggestions(['dal', 'sabzi', 'roti/rice', 'accompaniment'], db, userId)
    };
  }

  const planIds = plans.map(p => p.id);
  const placeholders = planIds.map(() => '?').join(',');

  const items = db.prepare(`
    SELECT mpi.*, r.name, r.category
    FROM meal_plan_items mpi
    LEFT JOIN recipes r ON r.id = mpi.recipe_id
    WHERE mpi.meal_plan_id IN (${placeholders})
  `).all(...planIds);

  const found = new Set();

  for (const item of items) {
    if (!item.recipe_id) continue;

    // Get enriched recipe data for classification
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(item.recipe_id);
    if (!recipe) continue;

    recipe.ingredients = db.prepare(`
      SELECT ri.*, i.name AS ingredient_name, i.category AS ingredient_category
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ?
    `).all(recipe.id);

    recipe.tags = db.prepare(`
      SELECT t.name FROM tags t
      JOIN recipe_tags rt ON rt.tag_id = t.id
      WHERE rt.recipe_id = ?
    `).all(recipe.id);

    const components = classifyRecipe(recipe);
    for (const c of components) found.add(c);
  }

  const allComponents = ['dal', 'sabzi', 'roti_rice', 'accompaniment'];
  const missing = allComponents
    .filter(c => !found.has(c))
    .map(c => THALI_COMPONENTS[c].label);

  return {
    complete: missing.length === 0,
    missing,
    suggestions: missing.length > 0 ? getSuggestions(missing, db, userId) : []
  };
}

function getSuggestions(missingLabels, db, userId) {
  const suggestions = [];

  for (const label of missingLabels) {
    // Find the component key from label
    const entry = Object.entries(THALI_COMPONENTS).find(([, v]) => v.label === label);
    if (!entry) continue;
    const [, comp] = entry;

    if (comp.namePatterns) {
      for (const pattern of comp.namePatterns.slice(0, 2)) {
        const recipe = db.prepare(
          'SELECT name FROM recipes WHERE user_id = ? AND name LIKE ? AND deleted_at IS NULL LIMIT 1'
        ).get(userId, `%${pattern}%`);
        if (recipe) {
          suggestions.push(recipe.name);
          break;
        }
      }
    }
  }

  return suggestions;
}

module.exports = { checkThaliCompleteness, classifyRecipe, THALI_COMPONENTS };
