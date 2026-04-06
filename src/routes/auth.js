const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { createRequirePassword } = require('../middleware/auth');

function validatePasswordStrength(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  return errors;
}

module.exports = function authRoutes({ db, audit }) {
  const router = Router();
  const requirePassword = createRequirePassword(db, bcrypt);

  // ─── Register ───
  router.post('/api/auth/register', async (req, res) => {
    const { email, password, display_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (typeof email !== 'string' || email.length > 254) return res.status(400).json({ error: 'Invalid email' });
    const pwErrors = validatePasswordStrength(password);
    if (pwErrors.length) return res.status(400).json({ error: pwErrors[0] });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(password, config.auth.saltRounds);

    const registerUser = db.transaction(() => {
      const result = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)').run(
        email.toLowerCase().trim(), hash, (display_name || '').slice(0, 100)
      );
      // Auto-create household
      const hh = db.prepare('INSERT INTO households (name, created_by) VALUES (?, ?)').run('My Family', result.lastInsertRowid);
      db.prepare('UPDATE users SET household_id = ?, household_role = ? WHERE id = ?').run(hh.lastInsertRowid, 'admin', result.lastInsertRowid);
      return result;
    });
    const result = registerUser();

    const sid = crypto.randomUUID();
    const days = config.session.maxAgeDays;
    db.prepare("INSERT INTO sessions (sid, user_id, expires_at) VALUES (?, ?, datetime('now', ?))").run(
      sid, result.lastInsertRowid, `+${days} days`
    );

    const parts = [`mf_sid=${sid}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${days * 86400}`];
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));

    if (audit) audit.log(result.lastInsertRowid, 'register', 'user', result.lastInsertRowid, req);

    res.status(201).json({ id: result.lastInsertRowid, email: email.toLowerCase().trim() });
  });

  // ─── Login ───
  router.post('/api/auth/login', async (req, res) => {
    const { email, password, remember } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // Check login attempts / lockout
    const attempt = db.prepare('SELECT * FROM login_attempts WHERE email = ?').get(email.toLowerCase().trim());
    if (attempt && attempt.locked_until && new Date(attempt.locked_until) > new Date()) {
      return res.status(429).json({ error: 'Account temporarily locked. Try again later.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    const DUMMY_HASH = '$2a$12$LJ3m9bSPlFcTNz1Ai3FHWO5Q8elMl7dbVlMH3.FzGQRxaL2VLrVFa';
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = bcrypt.compareSync(password, hashToCompare);

    if (!user || !valid) {
      // Track failed attempts
      if (attempt) {
        const attempts = attempt.attempts + 1;
        const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
        db.prepare('UPDATE login_attempts SET attempts = ?, locked_until = ? WHERE email = ?').run(attempts, lockUntil, email.toLowerCase().trim());
      } else {
        db.prepare('INSERT INTO login_attempts (email, attempts, first_attempt_at) VALUES (?, 1, CURRENT_TIMESTAMP)').run(email.toLowerCase().trim());
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Clear login attempts on success
    db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email.toLowerCase().trim());

    // Create session
    const sid = crypto.randomUUID();
    const days = remember ? config.session.rememberMeDays : config.session.maxAgeDays;
    db.prepare("INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, ?, datetime('now', ?))").run(
      sid, user.id, remember ? 1 : 0, `+${days} days`
    );

    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const parts = [`mf_sid=${sid}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${days * 86400}`];
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));

    if (audit) audit.log(user.id, 'login', 'user', user.id, req);

    res.json({ id: user.id, email: user.email, display_name: user.display_name });
  });

  // ─── Logout ───
  router.post('/api/auth/logout', (req, res) => {
    const cookies = {};
    (req.headers.cookie || '').split(';').forEach(pair => {
      const idx = pair.indexOf('=');
      if (idx > 0) cookies[pair.substring(0, idx).trim()] = pair.substring(idx + 1).trim();
    });
    const sid = cookies.mf_sid;
    if (sid) {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    }
    res.setHeader('Set-Cookie', [
      'mf_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
      'csrf_token=; SameSite=Strict; Path=/; Max-Age=0',
    ]);
    res.json({ ok: true });
  });

  // ─── Session check ───
  router.get('/api/auth/session', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(user);
  });

  // ─── Change password ───
  router.post('/api/auth/change-password', (req, res) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new password required' });
    const pwErrors = validatePasswordStrength(new_password);
    if (pwErrors.length) return res.status(400).json({ error: pwErrors[0] });

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
    if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(new_password, config.auth.saltRounds);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);

    // Invalidate all other sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND sid != ?').run(req.userId, req.sessionId);

    if (audit) audit.log(req.userId, 'change-password', 'user', req.userId, req);
    res.json({ ok: true });
  });

  // ─── Account deletion ───
  router.delete('/api/auth/account', requirePassword, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);

    res.setHeader('Set-Cookie', 'mf_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    if (audit) audit.log(req.userId, 'delete-account', 'user', req.userId, req);
    res.json({ ok: true });
  });

  return router;
};
