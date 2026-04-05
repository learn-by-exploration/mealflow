const { Router } = require('express');
const { seedIngredients, seedRecipes } = require('../../scripts/seed');

module.exports = function seedRoutes({ db }) {
  const router = Router();

  router.post('/api/seed/ingredients', (req, res) => {
    const result = seedIngredients(db, req.userId);
    res.json(result);
  });

  router.post('/api/seed/recipes', (req, res) => {
    const result = seedRecipes(db, req.userId);
    res.json(result);
  });

  return router;
};
