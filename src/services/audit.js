/**
 * Audit logging service for MealFlow.
 */
function createAuditLogger(db) {
  const stmt = db.prepare(`
    INSERT INTO audit_log (user_id, action, resource, resource_id, ip, ua, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  function log(userId, action, resource, resourceId, req, detail) {
    try {
      stmt.run(
        userId || null,
        action,
        resource || null,
        resourceId || null,
        req ? (req.ip || req.connection?.remoteAddress || null) : null,
        req ? (req.headers?.['user-agent'] || null) : null,
        detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null
      );
    } catch {}
  }

  function purge(days = 90) {
    try {
      db.prepare(`DELETE FROM audit_log WHERE created_at < datetime('now', ?)`).run(`-${days} days`);
    } catch {}
  }

  return { log, purge };
}

module.exports = createAuditLogger;
