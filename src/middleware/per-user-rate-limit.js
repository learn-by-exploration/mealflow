/**
 * Per-user rate limiting middleware using in-memory sliding window.
 * Tracks requests per userId with configurable limits.
 */
function createPerUserRateLimit({ maxRequests = 100, windowMs = 60000 } = {}) {
  const userRequests = new Map(); // userId -> [timestamps]

  // Periodic cleanup of expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamps] of userRequests) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) userRequests.delete(userId);
      else userRequests.set(userId, valid);
    }
  }, windowMs);
  if (cleanupInterval.unref) cleanupInterval.unref();

  return function perUserRateLimit(req, res, next) {
    if (!req.userId) return next();

    const now = Date.now();
    const timestamps = userRequests.get(req.userId) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests, please try again later' });
    }

    validTimestamps.push(now);
    userRequests.set(req.userId, validTimestamps);
    next();
  };
}

module.exports = createPerUserRateLimit;
