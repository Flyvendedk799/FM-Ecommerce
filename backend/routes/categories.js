const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const wrapAsync = require('../middleware/wrapAsync');

/* ---- auth: reads are public; writes are admin ---- */
router.use((req, res, next) => (req.method === 'GET' ? next() : requireAdmin(req, res, next)));

router.get('/', wrapAsync(async (req, res) => {
  const rows = await db.all(`
    SELECT cat.*, COUNT(c.id) as course_count
    FROM categories cat
    LEFT JOIN courses c ON c.category_id = cat.id AND c.status = 'active'
    GROUP BY cat.id
    ORDER BY cat.sort_order, cat.label
  `);
  res.json(rows);
}));

router.get('/:id', wrapAsync(async (req, res) => {
  const row = await db.get('SELECT * FROM categories WHERE id=?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
}));

router.put('/:id', wrapAsync(async (req, res) => {
  const existing = await db.get('SELECT * FROM categories WHERE id=?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { label, accent, bg, description, sort_order } = req.body;
  await db.run(`
    UPDATE categories SET label=?, accent=?, bg=?, description=?, sort_order=? WHERE id=?
  `,
    label ?? existing.label, accent ?? existing.accent, bg ?? existing.bg,
    description ?? existing.description, sort_order ?? existing.sort_order,
    req.params.id
  );
  res.json({ ok: true });
}));

module.exports = router;
