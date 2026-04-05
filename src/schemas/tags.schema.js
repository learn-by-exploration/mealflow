const { z } = require('zod');

const createTag = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/).default('#6C63FF'),
});

const updateTag = createTag.partial();

module.exports = { createTag, updateTag };
