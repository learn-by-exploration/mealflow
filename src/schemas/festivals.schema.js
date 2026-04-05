const { z } = require('zod');

const setPersonFestivals = z.object({
  festival_ids: z.array(z.number().int().positive()).max(50),
});

module.exports = { setPersonFestivals };
