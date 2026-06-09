const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const { statusOrDefault, statusStrict, intInRange, numInRange } = require('../validate');

/* ---- auth: reads are public; writes are admin ---- */
router.use((req, res, next) => (req.method === 'GET' ? next() : requireAdmin(req, res, next)));

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, COUNT(c.id) as course_count
    FROM suppliers s
    LEFT JOIN courses c ON c.supplier_id = s.id AND c.status != 'archived'
    GROUP BY s.id
    ORDER BY s.name
  `).all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { name, abbr = '', email = '', phone = '', website = '', description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const rating       = numInRange(req.body.rating, { min: 0, max: 5, field: 'rating', def: 0 });
  const review_count = intInRange(req.body.review_count, { min: 0, max: 10_000_000, field: 'review_count', def: 0 });
  const status       = statusOrDefault(req.body.status, 'supplier', 'active');
  const result = db.prepare(`
    INSERT INTO suppliers (name, abbr, email, phone, website, description, rating, review_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, abbr, email, phone, website, description, rating, review_count, status);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, abbr, email, phone, website, description } = req.body;
  const existing = db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const rating       = req.body.rating !== undefined ? numInRange(req.body.rating, { min: 0, max: 5, field: 'rating' }) : existing.rating;
  const review_count = req.body.review_count !== undefined ? intInRange(req.body.review_count, { min: 0, max: 10_000_000, field: 'review_count' }) : existing.review_count;
  const status       = statusStrict(req.body.status, 'supplier', existing.status);
  db.prepare(`
    UPDATE suppliers SET name=?, abbr=?, email=?, phone=?, website=?, description=?, rating=?, review_count=?, status=?
    WHERE id=?
  `).run(
    name ?? existing.name, abbr ?? existing.abbr, email ?? existing.email,
    phone ?? existing.phone, website ?? existing.website, description ?? existing.description,
    rating, review_count, status,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
