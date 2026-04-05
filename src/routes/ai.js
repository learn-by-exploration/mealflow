const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { updateAiConfig, suggestMeal, generateWeek } = require('../schemas/ai.schema');
const { encrypt } = require('../services/ai');

module.exports = function aiRoutes({ db }) {
  const router = Router();

  // ─── Get AI config ───
  router.get('/api/ai/config', (req, res) => {
    const row = db.prepare('SELECT * FROM ai_config WHERE user_id = ?').get(req.userId);
    if (!row) {
      return res.json({ provider: '', model: '', base_url: '', enabled: false, has_key: false });
    }
    res.json({
      provider: row.provider,
      model: row.model,
      base_url: row.base_url,
      enabled: !!row.enabled,
      has_key: !!(row.api_key_encrypted && row.api_key_encrypted.length > 0),
    });
  });

  // ─── Set AI config ───
  router.put('/api/ai/config', validate(updateAiConfig), (req, res) => {
    const { provider, api_key, model, base_url, enabled } = req.body;
    const encryptedKey = api_key ? encrypt(api_key) : '';
    const enabledInt = enabled ? 1 : 0;

    // Check if config exists
    const existing = db.prepare('SELECT user_id FROM ai_config WHERE user_id = ?').get(req.userId);

    if (existing) {
      if (api_key) {
        db.prepare(
          'UPDATE ai_config SET provider=?, api_key_encrypted=?, model=?, base_url=?, enabled=? WHERE user_id=?'
        ).run(provider, encryptedKey, model, base_url, enabledInt, req.userId);
      } else {
        db.prepare(
          'UPDATE ai_config SET provider=?, model=?, base_url=?, enabled=? WHERE user_id=?'
        ).run(provider, model, base_url, enabledInt, req.userId);
      }
    } else {
      db.prepare(
        'INSERT INTO ai_config (user_id, provider, api_key_encrypted, model, base_url, enabled) VALUES (?,?,?,?,?,?)'
      ).run(req.userId, provider, encryptedKey, model, base_url, enabledInt);
    }

    const row = db.prepare('SELECT * FROM ai_config WHERE user_id = ?').get(req.userId);
    res.json({
      provider: row.provider,
      model: row.model,
      base_url: row.base_url,
      enabled: !!row.enabled,
      has_key: !!(row.api_key_encrypted && row.api_key_encrypted.length > 0),
    });
  });

  // ─── Suggest meal (mock) ───
  router.post('/api/ai/suggest', validate(suggestMeal), (req, res) => {
    // Pick a random recipe from the database
    const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(req.userId);

    if (recipes.length === 0) {
      return res.json({
        suggestion: {
          name: 'Simple Dal Rice',
          description: 'A comforting bowl of dal with steamed rice',
          ingredients: ['toor dal', 'rice', 'turmeric', 'salt'],
          reason: 'A simple, nutritious meal suitable for any occasion',
        },
      });
    }

    const recipe = recipes[Math.floor(Math.random() * recipes.length)];
    const ingredients = db.prepare(
      'SELECT i.name FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id WHERE ri.recipe_id = ?'
    ).all(recipe.id).map(r => r.name);

    res.json({
      suggestion: {
        name: recipe.name,
        description: recipe.description || `A delicious ${recipe.cuisine || ''} dish`,
        ingredients,
        reason: `Suggested from your recipe collection${req.body.meal_type ? ` for ${req.body.meal_type}` : ''}`,
      },
    });
  });

  // ─── Generate weekly plan (mock) ───
  router.post('/api/ai/generate-week', validate(generateWeek), (req, res) => {
    const { start_date } = req.body;
    const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(req.userId);
    const mealTypes = ['breakfast', 'lunch', 'dinner'];

    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start_date);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const meals = mealTypes.map(type => {
        if (recipes.length === 0) {
          return { meal_type: type, recipe_name: 'Suggested Meal', recipe_id: null };
        }
        const recipe = recipes[Math.floor(Math.random() * recipes.length)];
        return { meal_type: type, recipe_name: recipe.name, recipe_id: recipe.id };
      });

      days.push({ date: dateStr, meals });
    }

    res.json({ plan: { days } });
  });

  return router;
};
