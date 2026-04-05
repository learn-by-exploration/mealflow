const { z } = require('zod');

const createPantryItem = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().min(0).default(0),
  unit: z.string().max(50).default(''),
  category: z.string().max(50).default('other'),
  ingredient_id: z.number().int().positive().optional(),
  location: z.enum(['kitchen', 'fridge', 'freezer', 'store_room']).default('kitchen'),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updatePantryItem = z.object({
  quantity: z.number().min(0).optional(),
  location: z.enum(['kitchen', 'fridge', 'freezer', 'store_room']).optional(),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const logPurchase = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().min(0).default(0),
  unit: z.string().max(50).default(''),
  price: z.number().min(0).optional(),
  store: z.string().max(100).default(''),
  ingredient_id: z.number().int().positive().optional(),
});

module.exports = { createPantryItem, updatePantryItem, logPurchase };
