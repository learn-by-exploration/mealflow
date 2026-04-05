const { z } = require('zod');

const createIngredient = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['vegetable', 'fruit', 'grain', 'protein', 'dairy', 'fat', 'spice', 'condiment', 'beverage', 'other']).default('other'),
  calories: z.number().min(0).max(10000).default(0),
  protein: z.number().min(0).max(1000).default(0),
  carbs: z.number().min(0).max(1000).default(0),
  fat: z.number().min(0).max(1000).default(0),
  fiber: z.number().min(0).max(1000).default(0),
  unit: z.string().max(20).default('g'),
});

const updateIngredient = createIngredient.partial();

module.exports = { createIngredient, updateIngredient };
