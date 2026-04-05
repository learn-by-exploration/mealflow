const { z } = require('zod');

const updateAiConfig = z.object({
  provider: z.enum(['openai', 'anthropic', 'ollama', 'custom']),
  api_key: z.string().min(1).max(500).optional(),
  model: z.string().max(100).default(''),
  base_url: z.string().max(500).default(''),
  enabled: z.boolean().default(false),
});

const suggestMeal = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  meal_type: z.string().optional(),
  preferences: z.string().max(500).default(''),
});

const generateWeek = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

module.exports = { updateAiConfig, suggestMeal, generateWeek };
