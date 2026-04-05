const logger = require('../logger');
const { AppError } = require('../errors');

/**
 * Global error-handling middleware.
 * Must be mounted AFTER all routes (Express identifies error handlers by 4-arity signature).
 */
function errorHandler(err, req, res, _next) {
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Request error');

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err.message && err.message.includes('SQLITE_CONSTRAINT')) {
    return res.status(409).json({ error: 'Constraint violation' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
}

module.exports = errorHandler;
