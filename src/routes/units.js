const { Router } = require('express');
const { convert, listUnits } = require('../services/unit-converter');

module.exports = function unitsRoutes() {
  const router = Router();

  // ─── List all supported units ───
  router.get('/api/units', (req, res) => {
    res.json(listUnits());
  });

  // ─── Convert between units ───
  router.get('/api/units/convert', (req, res) => {
    const { from, to, amount } = req.query;
    if (!from || !to || !amount) {
      return res.status(400).json({ error: 'from, to, and amount query parameters required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }

    const result = convert(from, to, numAmount);
    if (!result) {
      return res.status(400).json({ error: `Cannot convert from "${from}" to "${to}"` });
    }

    res.json(result);
  });

  return router;
};
