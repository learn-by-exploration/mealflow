const { z } = require('zod');

const createTemplate = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const applyTemplate = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

module.exports = { createTemplate, applyTemplate };
