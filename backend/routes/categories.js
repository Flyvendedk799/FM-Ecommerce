const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT cat.*, COUNT(c.id) as course_count
    FROM categories cat
    LEFT JOIN courses c ON c.category_id = cat.id AND c.status != 'archived'
    GROUP BY cat.id
    ORDER BY cat.sort_order, cat.label
  `).all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { label, accent, bg, description, sort_order } = req.body;
  db.prepare(`
    UPDATE categories SET label=?, accent=?, bg=?, description=?, sort_order=? WHERE id=?
  `).run(
    label ?? existing.label, accent ?? existing.accent, bg ?? existing.bg,
    description ?? existing.description, sort_order ?? existing.sort_order,
    req.params.id
  );
  res.json({ ok: true });
});

module.exports = router;
