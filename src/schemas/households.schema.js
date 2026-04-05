const { z } = require('zod');

const createHousehold = z.object({
  name: z.string().min(1).max(100),
});

const updateHousehold = z.object({
  name: z.string().min(1).max(100),
});

const createPerson = z.object({
  name: z.string().min(1).max(100),
  avatar_emoji: z.string().max(10).default('🙂'),
  dietary_type: z.enum(['vegetarian','non_vegetarian','eggetarian','vegan','jain','sattvic','swaminarayan']).default('vegetarian'),
  restrictions: z.array(z.string().max(50)).max(20).default([]),
  age_group: z.enum(['toddler','child','teen','adult','senior']).default('adult'),
  spice_level: z.number().int().min(1).max(5).default(3),
  sugar_level: z.number().int().min(1).max(5).default(3),
  calorie_target: z.number().positive().nullable().optional(),
  protein_target: z.number().positive().nullable().optional(),
  carbs_target: z.number().positive().nullable().optional(),
  fat_target: z.number().positive().nullable().optional(),
});

const updatePerson = createPerson.partial();

const assignPerson = z.object({
  person_id: z.number().int().positive(),
  servings: z.number().min(0.25).max(20).default(1),
  spice_override: z.number().int().min(1).max(5).nullable().optional(),
  sugar_override: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(500).default(''),
});

module.exports = { createHousehold, updateHousehold, createPerson, updatePerson, assignPerson };
