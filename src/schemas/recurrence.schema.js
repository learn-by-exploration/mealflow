const { z } = require('zod');
const { dateString } = require('./common.schema');

const createRecurrence = z.object({
  pattern: z.enum(['daily', 'specific_days', 'weekly', 'biweekly', 'monthly']),
  days_of_week: z.array(z.number().int().min(0).max(6)).default([]),
  start_date: dateString,
  end_date: dateString.optional(),
});

const expandRecurrence = z.object({
  from_date: dateString,
  to_date: dateString,
});

module.exports = { createRecurrence, expandRecurrence };
