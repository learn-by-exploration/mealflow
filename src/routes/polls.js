const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createPoll, castVote } = require('../schemas/polls.schema');
const { NotFoundError } = require('../errors');

module.exports = function pollRoutes({ db }) {
  const router = Router();

  // ─── Helper: get user's household_id ───
  function getUserHouseholdId(userId) {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId);
    return user ? user.household_id : null;
  }

  // ─── List polls for user's household ───
  router.get('/api/polls', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.json([]);

    const polls = db.prepare('SELECT * FROM polls WHERE household_id = ? ORDER BY created_at DESC').all(householdId);
    res.json(polls);
  });

  // ─── Create poll with options ───
  router.post('/api/polls', validate(createPoll), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const { question, target_date, target_meal_type, options, closes_at } = req.body;

    const poll = db.transaction(() => {
      const r = db.prepare('INSERT INTO polls (household_id, created_by, question, target_date, target_meal_type, status, closes_at) VALUES (?,?,?,?,?,?,?)').run(
        householdId, req.userId, question, target_date, target_meal_type, 'open', closes_at || null
      );
      const pollId = r.lastInsertRowid;

      const stmt = db.prepare('INSERT INTO poll_options (poll_id, recipe_id, custom_name, position) VALUES (?,?,?,?)');
      for (let i = 0; i < options.length; i++) {
        stmt.run(pollId, options[i].recipe_id || null, options[i].custom_name || '', i);
      }

      const created = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
      created.options = db.prepare('SELECT * FROM poll_options WHERE poll_id = ? ORDER BY position').all(pollId);
      return created;
    })();

    res.status(201).json(poll);
  });

  // ─── Poll detail with options and vote counts ───
  router.get('/api/polls/:id', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const poll = db.prepare('SELECT * FROM polls WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!poll) throw new NotFoundError('Poll', req.params.id);

    poll.options = db.prepare(`
      SELECT po.*, COUNT(pv.user_id) AS vote_count
      FROM poll_options po
      LEFT JOIN poll_votes pv ON pv.option_id = po.id
      WHERE po.poll_id = ?
      GROUP BY po.id
      ORDER BY po.position
    `).all(poll.id);

    res.json(poll);
  });

  // ─── Cast vote ───
  router.post('/api/polls/:id/vote', validate(castVote), (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const poll = db.prepare('SELECT * FROM polls WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!poll) throw new NotFoundError('Poll', req.params.id);
    if (poll.status !== 'open') return res.status(400).json({ error: 'Poll is not open' });

    const { option_id } = req.body;
    const option = db.prepare('SELECT * FROM poll_options WHERE id = ? AND poll_id = ?').get(option_id, poll.id);
    if (!option) return res.status(400).json({ error: 'Invalid option' });

    // Upsert vote: replace previous vote
    const existing = db.prepare('SELECT * FROM poll_votes WHERE poll_id = ? AND user_id = ?').get(poll.id, req.userId);
    if (existing) {
      db.prepare('UPDATE poll_votes SET option_id = ?, created_at = CURRENT_TIMESTAMP WHERE poll_id = ? AND user_id = ?').run(option_id, poll.id, req.userId);
    } else {
      db.prepare('INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?,?,?)').run(poll.id, option_id, req.userId);
    }

    res.json({ ok: true });
  });

  // ─── Close poll ───
  router.post('/api/polls/:id/close', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const poll = db.prepare('SELECT * FROM polls WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!poll) throw new NotFoundError('Poll', req.params.id);
    if (poll.status !== 'open') return res.status(400).json({ error: 'Poll is already closed' });

    // Determine winner (most votes)
    const options = db.prepare(`
      SELECT po.*, COUNT(pv.user_id) AS vote_count
      FROM poll_options po
      LEFT JOIN poll_votes pv ON pv.option_id = po.id
      WHERE po.poll_id = ?
      GROUP BY po.id
      ORDER BY vote_count DESC, po.position ASC
    `).all(poll.id);

    db.prepare("UPDATE polls SET status = 'closed' WHERE id = ?").run(poll.id);

    const winner = options[0] || null;
    res.json({ status: 'closed', winner, options });
  });

  // ─── Apply poll winner to meal plan ───
  router.post('/api/polls/:id/apply', (req, res) => {
    const householdId = getUserHouseholdId(req.userId);
    if (!householdId) return res.status(400).json({ error: 'No household' });

    const poll = db.prepare('SELECT * FROM polls WHERE id = ? AND household_id = ?').get(req.params.id, householdId);
    if (!poll) throw new NotFoundError('Poll', req.params.id);
    if (poll.status !== 'closed') return res.status(400).json({ error: 'Poll must be closed before applying' });

    // Get winner
    const winner = db.prepare(`
      SELECT po.*, COUNT(pv.user_id) AS vote_count
      FROM poll_options po
      LEFT JOIN poll_votes pv ON pv.option_id = po.id
      WHERE po.poll_id = ?
      GROUP BY po.id
      ORDER BY vote_count DESC, po.position ASC
      LIMIT 1
    `).get(poll.id);

    if (!winner) return res.status(400).json({ error: 'No options in poll' });

    db.transaction(() => {
      // Create or get meal plan for target_date + target_meal_type
      let mealPlan = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND date = ? AND meal_type = ?').get(req.userId, poll.target_date, poll.target_meal_type);
      if (!mealPlan) {
        const r = db.prepare('INSERT INTO meal_plans (user_id, date, meal_type) VALUES (?,?,?)').run(req.userId, poll.target_date, poll.target_meal_type);
        mealPlan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(r.lastInsertRowid);
      }

      // Add winning item
      const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM meal_plan_items WHERE meal_plan_id = ?').get(mealPlan.id).next;
      db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, custom_name, servings, position) VALUES (?,?,?,?,?)').run(
        mealPlan.id, winner.recipe_id || null, winner.custom_name || '', 1, maxPos
      );

      db.prepare("UPDATE polls SET status = 'applied' WHERE id = ?").run(poll.id);
    })();

    res.json({ status: 'applied', poll_id: poll.id });
  });

  return router;
};
