const { z } = require('zod');
const { mealType, dateString } = require('./common.schema');

const createMealPlan = z.object({
  date: dateString,
  meal_type: mealType,
});

const addMealPlanItem = z.object({
  recipe_id: z.number().int().positive().optional(),
  custom_name: z.string().max(200).default(''),
  servings: z.number().min(0.25).max(20).default(1),
});

module.exports = { createMealPlan, addMealPlanItem };
