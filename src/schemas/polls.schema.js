const { z } = require('zod');
const { dateString, mealType } = require('./common.schema');

const createPoll = z.object({
  question: z.string().min(1).max(200),
  target_date: dateString,
  target_meal_type: mealType,
  options: z.array(z.object({
    recipe_id: z.number().int().positive().optional(),
    custom_name: z.string().max(200).default(''),
  })).min(2).max(10),
  closes_at: z.string().datetime().optional(),
});

const castVote = z.object({
  option_id: z.number().int().positive(),
});

module.exports = { createPoll, castVote };
