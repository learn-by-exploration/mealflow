const { Router } = require('express');
const { NotFoundError } = require('../errors');

module.exports = function costRoutes({ db }) {
  const router = Router();

  // ─── Calculate cost for a meal plan ───
  router.post('/api/cost/meal/:id', (req, res) => {
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!plan) throw new NotFoundError('Meal plan', req.params.id);

    const items = db.prepare(
      `SELECT ri.quantity, ri.unit, i.name, i.price_per_unit, i.price_currency
       FROM meal_plan_items mpi
       JOIN recipe_ingredients ri ON ri.recipe_id = mpi.recipe_id
       JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE mpi.meal_plan_id = ?`
    ).all(plan.id);

    let totalCost = 0;
    const costItems = items.map(item => {
      const cost = item.price_per_unit ? item.quantity * item.price_per_unit : 0;
      totalCost += cost;
      return { name: item.name, cost: Math.round(cost * 100) / 100 };
    });

    res.json({
      total_cost: Math.round(totalCost * 100) / 100,
      currency: 'INR',
      items: costItems,
    });
  });

  // ─── Daily cost ───
  router.get('/api/cost/daily/:date', (req, res) => {
    const { date } = req.params;

    const items = db.prepare(
      `SELECT ri.quantity, i.name, i.price_per_unit
       FROM meal_plans mp
       JOIN meal_plan_items mpi ON mpi.meal_plan_id = mp.id
       JOIN recipe_ingredients ri ON ri.recipe_id = mpi.recipe_id
       JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE mp.user_id = ? AND mp.date = ?`
    ).all(req.userId, date);

    let totalCost = 0;
    const costItems = items.map(item => {
      const cost = item.price_per_unit ? item.quantity * item.price_per_unit : 0;
      totalCost += cost;
      return { name: item.name, cost: Math.round(cost * 100) / 100 };
    });

    res.json({
      date,
      total_cost: Math.round(totalCost * 100) / 100,
      currency: 'INR',
      items: costItems,
    });
  });

  // ─── Weekly cost summary ───
  router.get('/api/cost/weekly/:startDate', (req, res) => {
    const { startDate } = req.params;
    const start = new Date(startDate);

    const days = [];
    let weekTotal = 0;

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const items = db.prepare(
        `SELECT ri.quantity, i.price_per_unit
         FROM meal_plans mp
         JOIN meal_plan_items mpi ON mpi.meal_plan_id = mp.id
         JOIN recipe_ingredients ri ON ri.recipe_id = mpi.recipe_id
         JOIN ingredients i ON i.id = ri.ingredient_id
         WHERE mp.user_id = ? AND mp.date = ?`
      ).all(req.userId, dateStr);

      let dayCost = 0;
      for (const item of items) {
        dayCost += item.price_per_unit ? item.quantity * item.price_per_unit : 0;
      }
      dayCost = Math.round(dayCost * 100) / 100;
      weekTotal += dayCost;

      days.push({ date: dateStr, cost: dayCost });
    }

    res.json({
      total_cost: Math.round(weekTotal * 100) / 100,
      currency: 'INR',
      start_date: startDate,
      days,
    });
  });

  return router;
};
