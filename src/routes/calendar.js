const { Router } = require('express');

module.exports = function calendarRoutes({ db }) {
  const router = Router();

  /**
   * Get festivals for a given date by checking date_rule JSON.
   */
  function getFestivalsForDate(dateStr, festivals) {
    const names = [];
    for (const f of festivals) {
      try {
        const rule = JSON.parse(f.date_rule);
        if (rule.dates) {
          const year = dateStr.slice(0, 4);
          const festDate = rule.dates[year];
          if (festDate === dateStr) {
            names.push(f.name);
          } else if (festDate && f.duration_days > 1) {
            // Check if dateStr falls within multi-day festival
            const start = new Date(festDate + 'T00:00:00');
            const check = new Date(dateStr + 'T00:00:00');
            const end = new Date(start);
            end.setDate(end.getDate() + f.duration_days - 1);
            if (check >= start && check <= end) {
              names.push(f.name);
            }
          }
        }
      } catch {}
    }
    return names;
  }

  /**
   * Build a day summary for a given date.
   */
  function buildDaySummary(dateStr, userId, festivals) {
    const plans = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND date = ?').all(userId, dateStr);
    const meals = plans.map(p => {
      const itemCount = db.prepare('SELECT COUNT(*) AS cnt FROM meal_plan_items WHERE meal_plan_id = ?').get(p.id).cnt;
      return { type: p.meal_type, item_count: itemCount };
    });
    const festival_names = getFestivalsForDate(dateStr, festivals);
    return { date: dateStr, meals, festival_names };
  }

  // ─── Today's summary ───
  router.get('/api/calendar/today', (req, res) => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const festivals = db.prepare('SELECT * FROM festivals').all();
    const summary = buildDaySummary(dateStr, req.userId, festivals);
    res.json(summary);
  });

  // ─── Monthly calendar ───
  router.get('/api/calendar/:year/:month', (req, res) => {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const festivals = db.prepare('SELECT * FROM festivals').all();
    const days = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push(buildDaySummary(dateStr, req.userId, festivals));
    }

    res.json({ days });
  });

  return router;
};
