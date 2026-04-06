const logger = require('../logger');
const { AppError } = require('../errors');

/**
 * Global error-handling middleware.
 * Must be mounted AFTER all routes (Express identifies error handlers by 4-arity signature).
 */
function errorHandler(err, req, res, _next) {
  logger.error({ err, method: req.method, url: req.originalUrl, requestId: req.requestId }, 'Request error');

  if (err instanceof AppError) {
    const body = { error: err.message, code: err.code };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }

  if (err.message && err.message.includes('SQLITE_CONSTRAINT')) {
    return res.status(409).json({ error: 'Constraint violation', code: 'CONFLICT' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON', code: 'PARSE_ERROR' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload too large. Maximum size is 1MB.', code: 'PAYLOAD_TOO_LARGE' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message, code: 'INTERNAL_ERROR' });
}

module.exports = errorHandler;
