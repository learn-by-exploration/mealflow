/**
 * Reusable input validation helpers for MealFlow routes.
 */
const { ZodError } = require('zod');

const COLOR_HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidColor(value) {
  if (!value) return true;
  return COLOR_HEX_RE.test(String(value));
}

function isValidDate(value) {
  if (!value) return true;
  if (!DATE_RE.test(String(value))) return false;
  const [y, m, d] = String(value).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

function isNonNegativeInt(value) {
  if (value === undefined || value === null) return true;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

function isWithinLength(value, max) {
  if (!value) return true;
  return String(value).length <= max;
}

/**
 * Zod-based validation middleware factory.
 * Usage: router.post('/api/foo', validate(fooSchema), handler)
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      const msg = issues.map(e => {
        const field = e.path.join('.');
        return field ? `${field}: ${e.message}` : e.message;
      }).join(', ');
      return res.status(400).json({ error: msg, code: 'VALIDATION_ERROR' });
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { isValidColor, isValidDate, isPositiveInt, isNonNegativeInt, isWithinLength, validate, COLOR_HEX_RE, DATE_RE };
