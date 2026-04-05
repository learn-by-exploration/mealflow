const { Router } = require('express');
const { validate } = require('../middleware/validate');
const { createTag, updateTag } = require('../schemas/tags.schema');
const { NotFoundError, ConflictError } = require('../errors');

module.exports = function tagsRoutes({ db }) {
  const router = Router();

  // ─── List tags ───
  router.get('/api/tags', (req, res) => {
    const tags = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name').all(req.userId);
    // Add usage counts
    for (const tag of tags) {
      tag.recipe_count = db.prepare('SELECT COUNT(*) AS c FROM recipe_tags WHERE tag_id = ?').get(tag.id).c;
    }
    res.json(tags);
  });

  // ─── Create tag ───
  router.post('/api/tags', validate(createTag), (req, res) => {
    const { name, color } = req.body;
    const existing = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(req.userId, name);
    if (existing) throw new ConflictError('Tag already exists');

    const result = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(req.userId, name, color || '#6C63FF');
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(tag);
  });

  // ─── Update tag ───
  router.put('/api/tags/:id', validate(updateTag), (req, res) => {
    const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!tag) throw new NotFoundError('Tag', req.params.id);

    const data = req.body;
    if (data.name !== undefined) {
      const dup = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ? AND id != ?').get(req.userId, data.name, tag.id);
      if (dup) throw new ConflictError('Tag name already exists');
    }

    const fields = [];
    const values = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color); }

    if (fields.length) {
      values.push(req.params.id);
      db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  // ─── Delete tag ───
  router.delete('/api/tags/:id', (req, res) => {
    const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!tag) throw new NotFoundError('Tag', req.params.id);
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
