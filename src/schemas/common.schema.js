const { z } = require('zod');

const positiveInt = z.coerce.number().int().positive();
const idParam = z.object({ id: positiveInt });
const hexColor = z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mealType = z.enum(['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner', 'snack', 'custom']);
const difficulty = z.enum(['easy', 'medium', 'hard']);

module.exports = { positiveInt, idParam, hexColor, dateString, mealType, difficulty };
