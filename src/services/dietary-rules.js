/**
 * Dietary rules engine for Indian dietary restrictions.
 * Supports: Jain, Sattvic, Swaminarayan diets.
 */

const DIETARY_RULES = {
  jain: {
    label: 'Jain',
    description: 'No root vegetables, no food after sunset',
    forbidden_root_vegetables: true,
    forbidden_ingredients: ['Onion', 'Garlic', 'Potato', 'Carrot', 'Ginger', 'Beetroot', 'Radish', 'Turnip', 'Sweet Potato'],
    forbidden_categories: [],
    forbidden_tags: ['non-vegetarian'],
  },
  sattvic: {
    label: 'Sattvic',
    description: 'No onion, garlic, mushroom, non-veg. Pure vegetarian.',
    forbidden_root_vegetables: false,
    forbidden_ingredients: ['Onion', 'Garlic'],
    forbidden_categories: ['proteins'],
    forbidden_tags: ['non-vegetarian'],
    forbidden_name_patterns: ['mushroom', 'egg', 'chicken', 'mutton', 'fish', 'prawn', 'meat'],
  },
  swaminarayan: {
    label: 'Swaminarayan',
    description: 'No onion, garlic, non-veg. Similar to sattvic with additional restrictions.',
    forbidden_root_vegetables: false,
    forbidden_ingredients: ['Onion', 'Garlic'],
    forbidden_categories: ['proteins'],
    forbidden_tags: ['non-vegetarian'],
    forbidden_name_patterns: ['mushroom', 'egg', 'chicken', 'mutton', 'fish', 'prawn', 'meat'],
  },
};

/**
 * Check if a recipe is suitable for a given dietary type.
 * @param {object} recipe - Recipe with ingredients[{ ingredient_name, is_root_vegetable }], tags[]
 * @param {string} dietaryType - 'jain', 'sattvic', 'swaminarayan'
 * @returns {{ suitable: boolean, violations: string[] }}
 */
function checkRecipeSuitability(recipe, dietaryType) {
  const rules = DIETARY_RULES[dietaryType];
  if (!rules) return { suitable: true, violations: [] };

  const violations = [];
  const recipeName = (recipe.name || '').toLowerCase();

  // Check recipe name patterns
  if (rules.forbidden_name_patterns) {
    for (const pattern of rules.forbidden_name_patterns) {
      if (recipeName.includes(pattern)) {
        violations.push(`Recipe name contains "${pattern}"`);
      }
    }
  }

  // Check tags
  if (rules.forbidden_tags && recipe.tags) {
    const tagNames = recipe.tags.map(t => (typeof t === 'string' ? t : t.name || '').toLowerCase());
    for (const ft of rules.forbidden_tags) {
      if (tagNames.includes(ft)) {
        violations.push(`Tag "${ft}" is not allowed`);
      }
    }
  }

  // Check ingredients
  if (recipe.ingredients) {
    for (const ing of recipe.ingredients) {
      const ingName = ing.ingredient_name || ing.name || '';

      // Check forbidden ingredients by name
      if (rules.forbidden_ingredients.some(fi => ingName.toLowerCase().includes(fi.toLowerCase()))) {
        violations.push(`Ingredient "${ingName}" is not allowed`);
      }

      // Check root vegetables for Jain diet
      if (rules.forbidden_root_vegetables && ing.is_root_vegetable) {
        violations.push(`Root vegetable "${ingName}" is not allowed`);
      }

      // Check forbidden categories
      if (rules.forbidden_categories) {
        const ingCategory = (ing.ingredient_category || ing.category || '').toLowerCase();
        if (rules.forbidden_categories.includes(ingCategory)) {
          violations.push(`Category "${ingCategory}" ingredient "${ingName}" is not allowed`);
        }
      }
    }
  }

  return { suitable: violations.length === 0, violations };
}

/**
 * Filter recipes suitable for a dietary type.
 * @param {object[]} recipes - Array of enriched recipes
 * @param {string} dietaryType
 * @returns {object[]}
 */
function filterRecipesForDiet(recipes, dietaryType) {
  if (!DIETARY_RULES[dietaryType]) return recipes;
  return recipes.filter(r => checkRecipeSuitability(r, dietaryType).suitable);
}

/**
 * Validate a meal plan for a person against their dietary rules.
 * @param {object} db - Database instance
 * @param {number} personId - Person ID
 * @param {string} date - Date string YYYY-MM-DD
 * @param {number} userId - User ID
 * @returns {{ valid: boolean, violations: object[] }}
 */
function validateMealPlanForPerson(db, personId, date, userId) {
  const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(personId);
  if (!person) return { valid: true, violations: [] };

  const dietaryType = person.dietary_type;
  if (!DIETARY_RULES[dietaryType]) return { valid: true, violations: [] };

  const items = db.prepare(`
    SELECT mpi.*, r.name AS recipe_name
    FROM meal_plan_items mpi
    JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
    JOIN person_assignments pa ON pa.meal_plan_item_id = mpi.id
    LEFT JOIN recipes r ON r.id = mpi.recipe_id
    WHERE mp.date = ? AND mp.user_id = ? AND pa.person_id = ?
  `).all(date, userId, personId);

  const violations = [];

  for (const item of items) {
    if (!item.recipe_id) continue;

    const recipe = { name: item.recipe_name, id: item.recipe_id };

    recipe.ingredients = db.prepare(`
      SELECT ri.*, i.name AS ingredient_name, i.category AS ingredient_category,
             i.is_root_vegetable
      FROM recipe_ingredients ri
      JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = ?
    `).all(item.recipe_id);

    recipe.tags = db.prepare(`
      SELECT t.name FROM tags t
      JOIN recipe_tags rt ON rt.tag_id = t.id
      WHERE rt.recipe_id = ?
    `).all(item.recipe_id);

    const result = checkRecipeSuitability(recipe, dietaryType);
    if (!result.suitable) {
      violations.push({
        person_name: person.name,
        recipe_name: item.recipe_name,
        dietary_type: dietaryType,
        issues: result.violations,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}

module.exports = {
  DIETARY_RULES,
  checkRecipeSuitability,
  filterRecipesForDiet,
  validateMealPlanForPerson,
};
