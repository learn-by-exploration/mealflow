const { z } = require('zod');
const { difficulty } = require('./common.schema');

const createRecipe = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  servings: z.number().int().min(1).max(100).default(1),
  prep_time: z.number().int().min(0).max(1440).default(0),
  cook_time: z.number().int().min(0).max(1440).default(0),
  cuisine: z.string().max(100).default(''),
  difficulty: difficulty.default('easy'),
  image_url: z.string().max(500).default(''),
  source_url: z.string().max(500).default(''),
  notes: z.string().max(5000).default(''),
  is_favorite: z.number().int().min(0).max(1).default(0),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  ingredients: z.array(z.object({
    ingredient_id: z.number().int().positive(),
    quantity: z.number().min(0).default(0),
    unit: z.string().max(20).default('g'),
    notes: z.string().max(200).default(''),
  })).optional(),
});

const updateRecipe = createRecipe.partial();

module.exports = { createRecipe, updateRecipe };
