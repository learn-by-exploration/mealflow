const { Router } = require('express');
const { NotFoundError } = require('../errors');

module.exports = function notificationRoutes({ db }) {
  const router = Router();

  // ─── List notifications ───
  router.get('/api/notifications', (req, res) => {
    const showAll = req.query.all === 'true';
    let sql = 'SELECT * FROM notifications WHERE user_id = ?';
    if (!showAll) sql += ' AND read = 0';
    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(req.userId);
    res.json(rows);
  });

  // ─── Get notification preferences ───
  router.get('/api/notifications/preferences', (req, res) => {
    const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').all(req.userId);
    res.json(prefs);
  });

  // ─── Mark notification as read ───
  router.post('/api/notifications/:id/read', (req, res) => {
    const notif = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!notif) throw new NotFoundError('Notification', req.params.id);
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(notif.id);
    res.json({ ...notif, read: 1 });
  });

  // ─── Update notification preference ───
  router.put('/api/notifications/preferences', (req, res) => {
    const { type, enabled, time } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required' });
    const enabledVal = enabled ? 1 : 0;
    const timeVal = time || '07:00';
    db.prepare(
      'INSERT INTO notification_preferences (user_id, type, enabled, time) VALUES (?,?,?,?) ON CONFLICT(user_id, type) DO UPDATE SET enabled=excluded.enabled, time=excluded.time'
    ).run(req.userId, type, enabledVal, timeVal);
    const pref = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ? AND type = ?').get(req.userId, type);
    res.json(pref);
  });

  return router;
};
