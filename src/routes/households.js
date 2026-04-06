const { Router } = require('express');
const crypto = require('crypto');
const { validate } = require('../middleware/validate');
const { createHousehold, updateHousehold } = require('../schemas/households.schema');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../errors');

module.exports = function householdRoutes({ db, audit }) {
  const router = Router();

  // ─── Create household ───
  router.post('/api/households', validate(createHousehold), (req, res) => {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (user && user.household_id) throw new ConflictError('User already belongs to a household');

    const createHH = db.transaction(() => {
      const result = db.prepare('INSERT INTO households (name, created_by) VALUES (?, ?)').run(req.body.name, req.userId);
      db.prepare('UPDATE users SET household_id = ?, household_role = ? WHERE id = ?').run(result.lastInsertRowid, 'admin', req.userId);
      return db.prepare('SELECT * FROM households WHERE id = ?').get(result.lastInsertRowid);
    });
    const household = createHH();
    if (audit) audit.log(req.userId, 'create', 'household', household.id, req);
    res.status(201).json(household);
  });

  // ─── Get current user's household ───
  router.get('/api/households/current', (req, res) => {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.household_id) throw new NotFoundError('Household');

    const household = db.prepare('SELECT * FROM households WHERE id = ?').get(user.household_id);
    if (!household) throw new NotFoundError('Household');

    const members = db.prepare('SELECT id, email, display_name FROM users WHERE household_id = ?').all(household.id);
    const personCount = db.prepare('SELECT COUNT(*) as cnt FROM persons WHERE household_id = ?').get(household.id).cnt;
    res.json({ ...household, members, person_count: personCount });
  });

  // ─── Update household name ───
  router.put('/api/households/current', validate(updateHousehold), (req, res) => {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.household_id) throw new NotFoundError('Household');

    db.prepare('UPDATE households SET name = ? WHERE id = ?').run(req.body.name, user.household_id);
    const household = db.prepare('SELECT * FROM households WHERE id = ?').get(user.household_id);
    if (audit) audit.log(req.userId, 'update', 'household', household.id, req);
    res.json(household);
  });

  // ─── Generate invite code ───
  router.post('/api/households/invite', (req, res) => {
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.household_id) throw new NotFoundError('Household');

    const code = crypto.randomBytes(16).toString('hex');
    db.prepare("INSERT INTO invite_codes (code, household_id, created_by, expires_at) VALUES (?,?,?,datetime('now','+7 days'))").run(
      code, user.household_id, req.userId
    );

    if (audit) audit.log(req.userId, 'create', 'invite_code', null, req);
    res.status(201).json({ code });
  });

  // ─── Join household by invite code ───
  router.post('/api/households/join', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Invite code required' });

    const invite = db.prepare("SELECT * FROM invite_codes WHERE code = ? AND expires_at > datetime('now')").get(code);
    if (!invite) throw new NotFoundError('Invite code');
    if (invite.uses >= invite.max_uses) throw new ConflictError('Invite code has reached maximum uses');

    // Check if user already has a household
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(req.userId);
    if (user && user.household_id) throw new ConflictError('User already belongs to a household');

    const joinHH = db.transaction(() => {
      db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(invite.household_id, req.userId);
      db.prepare('UPDATE invite_codes SET uses = uses + 1 WHERE code = ?').run(code);
    });
    joinHH();

    if (audit) audit.log(req.userId, 'join', 'household', invite.household_id, req);
    res.json({ household_id: invite.household_id });
  });

  // ─── Delete household (admin only) ───
  router.delete('/api/households/current', (req, res) => {
    const user = db.prepare('SELECT household_id, household_role FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.household_id) throw new NotFoundError('Household');
    if (user.household_role !== 'admin') throw new ForbiddenError('Only admins can delete the household');

    const hhId = user.household_id;
    // Clear household_id for all members first, then delete
    db.prepare('UPDATE users SET household_id = NULL, household_role = ? WHERE household_id = ?').run('member', hhId);
    db.prepare('DELETE FROM households WHERE id = ?').run(hhId);

    if (audit) audit.log(req.userId, 'delete', 'household', hhId, req);
    res.json({ ok: true });
  });

  return router;
};
