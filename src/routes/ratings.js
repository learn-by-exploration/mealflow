const { Router } = require('express');
const { NotFoundError, ValidationError } = require('../errors');

module.exports = function ratingsRoutes({ db }) {
  const router = Router();

  // ─── Rate a meal item ───
  router.post('/api/meals/:itemId/rate', (req, res) => {
    const itemId = parseInt(req.params.itemId, 10);
    const item = db.prepare(`
      SELECT mpi.* FROM meal_plan_items mpi
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE mpi.id = ? AND mp.user_id = ?
    `).get(itemId, req.userId);
    if (!item) throw new NotFoundError('Meal plan item', itemId);

    const { rating, person_id, comment } = req.body;
    if (!rating || !person_id) {
      return res.status(400).json({ error: 'rating and person_id required', code: 'VALIDATION_ERROR' });
    }

    const ratingInt = parseInt(rating, 10);
    if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5', code: 'VALIDATION_ERROR' });
    }

    const personIdInt = parseInt(person_id, 10);
    const person = db.prepare('SELECT id FROM persons WHERE id = ?').get(personIdInt);
    if (!person) throw new NotFoundError('Person', personIdInt);

    // Upsert: try update first, then insert
    const existing = db.prepare('SELECT id FROM meal_ratings WHERE meal_plan_item_id = ? AND person_id = ?')
      .get(itemId, personIdInt);

    if (existing) {
      db.prepare('UPDATE meal_ratings SET rating = ?, comment = ? WHERE id = ?')
        .run(ratingInt, comment || '', existing.id);
      const updated = db.prepare('SELECT * FROM meal_ratings WHERE id = ?').get(existing.id);
      return res.json(updated);
    }

    const result = db.prepare(
      'INSERT INTO meal_ratings (meal_plan_item_id, person_id, rating, comment) VALUES (?, ?, ?, ?)'
    ).run(itemId, personIdInt, ratingInt, comment || '');

    const created = db.prepare('SELECT * FROM meal_ratings WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  });

  // ─── Get ratings for a meal item ───
  router.get('/api/meals/:itemId/ratings', (req, res) => {
    const itemId = parseInt(req.params.itemId, 10);
    const item = db.prepare(`
      SELECT mpi.* FROM meal_plan_items mpi
      JOIN meal_plans mp ON mp.id = mpi.meal_plan_id
      WHERE mpi.id = ? AND mp.user_id = ?
    `).get(itemId, req.userId);
    if (!item) throw new NotFoundError('Meal plan item', itemId);

    const ratings = db.prepare(`
      SELECT mr.*, p.name AS person_name
      FROM meal_ratings mr
      LEFT JOIN persons p ON p.id = mr.person_id
      WHERE mr.meal_plan_item_id = ?
      ORDER BY mr.created_at
    `).all(itemId);

    const average = ratings.length > 0
      ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 100) / 100
      : 0;

    res.json({ ratings, average, count: ratings.length });
  });

  // ─── Get average rating for a recipe (across all meal items) ───
  router.get('/api/recipes/:id/ratings', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    const recipe = db.prepare('SELECT id FROM recipes WHERE id = ? AND user_id = ?').get(recipeId, req.userId);
    if (!recipe) throw new NotFoundError('Recipe', recipeId);

    const result = db.prepare(`
      SELECT AVG(mr.rating) AS average, COUNT(mr.id) AS count
      FROM meal_ratings mr
      JOIN meal_plan_items mpi ON mpi.id = mr.meal_plan_item_id
      WHERE mpi.recipe_id = ?
    `).get(recipeId);

    res.json({
      recipe_id: recipeId,
      average: result.average ? Math.round(result.average * 100) / 100 : 0,
      count: result.count,
    });
  });

  return router;
};
