const fs = require('fs');
const path = require('path');

/**
 * Seed system ingredients from data/ingredients.json
 */
function seedIngredients(db, userId) {
  const dataPath = path.join(__dirname, '..', 'data', 'ingredients.json');
  const ingredients = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  let count = 0;
  const insert = db.prepare(`
    INSERT INTO ingredients (user_id, name, category, calories, protein, carbs, fat, fiber, unit, is_system, alt_unit, alt_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const ing of items) {
      const existing = db.prepare('SELECT id FROM ingredients WHERE name = ? AND is_system = 1').get(ing.name);
      if (existing) continue;
      insert.run(
        userId, ing.name, ing.category || 'other',
        ing.calories || 0, ing.protein || 0, ing.carbs || 0, ing.fat || 0, ing.fiber || 0,
        ing.unit || 'g', ing.alt_unit || '', ing.alt_quantity || 0
      );
      count++;
    }
  });

  insertMany(ingredients);

  const total = db.prepare('SELECT COUNT(*) AS c FROM ingredients WHERE is_system = 1').get().c;
  return { count: total, inserted: count };
}

/**
 * Seed system recipes from data/recipes/*.json
 */
function seedRecipes(db, userId) {
  const recipesDir = path.join(__dirname, '..', 'data', 'recipes');
  if (!fs.existsSync(recipesDir)) return { count: 0, inserted: 0 };

  const files = fs.readdirSync(recipesDir).filter(f => f.endsWith('.json'));
  let count = 0;

  const insertRecipe = db.prepare(`
    INSERT INTO recipes (user_id, name, description, servings, prep_time, cook_time, cuisine, difficulty, region, is_system, position, meal_suitability, cooking_method, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `);

  const insertRecipeIng = db.prepare(`
    INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes, position)
    VALUES (?, ?, ?, ?, '', ?)
  `);

  const seedAll = db.transaction(() => {
    for (const file of files) {
      const recipes = JSON.parse(fs.readFileSync(path.join(recipesDir, file), 'utf8'));

      for (const r of recipes) {
        const existing = db.prepare('SELECT id FROM recipes WHERE name = ? AND is_system = 1').get(r.name);
        if (existing) continue;

        const position = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM recipes WHERE user_id = ?').get(userId)).next;

        const result = insertRecipe.run(
          userId, r.name, r.description || '', r.servings || 1,
          r.prep_time || 0, r.cook_time || 0, r.cuisine || '',
          r.difficulty || 'easy', r.region || '', position,
          JSON.stringify(r.meal_suitability || []),
          r.cooking_method || '',
          r.category || 'main'
        );
        const recipeId = result.lastInsertRowid;

        // Link ingredients by name
        if (r.ingredients) {
          r.ingredients.forEach((ing, i) => {
            const dbIng = db.prepare('SELECT id FROM ingredients WHERE name = ? AND is_system = 1').get(ing.name);
            if (dbIng) {
              insertRecipeIng.run(recipeId, dbIng.id, ing.quantity || 0, ing.unit || 'g', i);
            }
          });
        }

        // Create/link tags
        if (r.tags) {
          for (const tagName of r.tags) {
            let tag = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(userId, tagName);
            if (!tag) {
              const tr = db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)').run(userId, tagName);
              tag = { id: tr.lastInsertRowid };
            }
            db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
          }
        }

        count++;
      }
    }
  });

  seedAll();

  const total = db.prepare('SELECT COUNT(*) AS c FROM recipes WHERE is_system = 1').get().c;
  return { count: total, inserted: count };
}

/**
 * Seed festivals from data/festivals.json
 */
function seedFestivals(db) {
  const dataPath = path.join(__dirname, '..', 'data', 'festivals.json');
  const festivals = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  let count = 0;

  const insertFestival = db.prepare(`
    INSERT INTO festivals (name, name_hindi, type, region, date_rule, duration_days, description, is_fasting, fasting_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRule = db.prepare(`
    INSERT INTO fasting_rules (festival_id, rule_type, category, ingredient_name, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertFestivalRecipe = db.prepare(`
    INSERT OR IGNORE INTO festival_recipes (festival_id, recipe_id) VALUES (?, ?)
  `);

  const seedAll = db.transaction(() => {
    for (const f of festivals) {
      const existing = db.prepare('SELECT id FROM festivals WHERE name = ?').get(f.name);
      if (existing) continue;

      const result = insertFestival.run(
        f.name, f.name_hindi || '', f.type, f.region || 'pan_india',
        f.date_rule, f.duration_days || 1, f.description || '',
        f.is_fasting || 0, f.fasting_type || ''
      );
      const festivalId = result.lastInsertRowid;

      // Insert fasting rules
      if (f.fasting_rules) {
        for (const rule of f.fasting_rules) {
          insertRule.run(
            festivalId, rule.rule_type,
            rule.category || null, rule.ingredient_name || null,
            rule.notes || ''
          );
        }
      }

      // Link recipes by name
      if (f.recipes) {
        for (const recipeName of f.recipes) {
          const recipe = db.prepare('SELECT id FROM recipes WHERE name = ?').get(recipeName);
          if (recipe) {
            insertFestivalRecipe.run(festivalId, recipe.id);
          }
        }
      }

      count++;
    }
  });

  seedAll();

  const total = db.prepare('SELECT COUNT(*) AS c FROM festivals').get().c;
  return { count: total, inserted: count };
}

module.exports = { seedIngredients, seedRecipes, seedFestivals };

// CLI: node scripts/seed.js
if (require.main === module) {
  const initDatabase = require('../src/db');
  const config = require('../src/config');
  const { db } = initDatabase(config.dbDir);

  // Use user_id=1 or create a system user
  let user = db.prepare('SELECT id FROM users WHERE id = 1').get();
  if (!user) {
    const bcrypt = require('bcryptjs');
    db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run(
      'system@mealflow.local', bcrypt.hashSync('system', 4), 'System'
    );
    user = { id: 1 };
  }

  console.log('Seeding ingredients...');
  const ingResult = seedIngredients(db, user.id);
  console.log(`  ${ingResult.inserted} new, ${ingResult.count} total`);

  console.log('Seeding recipes...');
  const recResult = seedRecipes(db, user.id);
  console.log(`  ${recResult.inserted} new, ${recResult.count} total`);

  console.log('Seeding festivals...');
  const festResult = seedFestivals(db);
  console.log(`  ${festResult.inserted} new, ${festResult.count} total`);

  console.log('Done.');
  db.close();
}
