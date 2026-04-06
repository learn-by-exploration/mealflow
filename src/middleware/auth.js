/**
 * Authentication middleware for MealFlow.
 * Reads mf_sid cookie, validates session, sets req.userId.
 */

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function createAuthMiddleware(db) {
  function requireAuth(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.mf_sid;

    if (!sid) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const session = db.prepare(
      "SELECT * FROM sessions WHERE sid = ? AND expires_at > datetime('now')"
    ).get(sid);

    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    req.userId = session.user_id;
    req.sessionId = sid;
    req.authMethod = 'session';

    // Set householdId for household-scoped access
    const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(session.user_id);
    if (user) req.householdId = user.household_id;

    next();
  }

  function optionalAuth(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.mf_sid;

    if (sid) {
      const session = db.prepare(
        "SELECT * FROM sessions WHERE sid = ? AND expires_at > datetime('now')"
      ).get(sid);
      if (session) {
        req.userId = session.user_id;
        req.sessionId = sid;
        req.authMethod = 'session';
      }
    }
    next();
  }

  return { requireAuth, optionalAuth };
}

function createRequirePassword(db, bcrypt) {
  const DUMMY_HASH = bcrypt.hashSync('__dummy_timing_pad__', 12);
  return function requirePassword(req, res, next) {
    const { password } = req.body;
    if (!password) {
      return res.status(403).json({ error: 'Password confirmation required for this action' });
    }
    const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.userId);
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = bcrypt.compareSync(password, hashToCompare);
    if (!user || !valid) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    next();
  };
}

module.exports = createAuthMiddleware;
module.exports.createRequirePassword = createRequirePassword;
