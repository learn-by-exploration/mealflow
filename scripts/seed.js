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
    INSERT INTO recipes (user_id, name, description, servings, prep_time, cook_time, cuisine, difficulty, region, is_system, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
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
          r.difficulty || 'easy', r.region || '', position
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

module.exports = { seedIngredients, seedRecipes };

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

  console.log('Done.');
  db.close();
}
