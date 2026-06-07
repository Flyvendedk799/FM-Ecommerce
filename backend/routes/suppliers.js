const express = require('express');
const router = express.Router();
const db = require('../db');

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
  const { name, abbr = '', email = '', phone = '', website = '', description = '', rating = 0, review_count = 0, status = 'active' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare(`
    INSERT INTO suppliers (name, abbr, email, phone, website, description, rating, review_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, abbr, email, phone, website, description, rating, review_count, status);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, abbr, email, phone, website, description, rating, review_count, status } = req.body;
  const existing = db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    UPDATE suppliers SET name=?, abbr=?, email=?, phone=?, website=?, description=?, rating=?, review_count=?, status=?
    WHERE id=?
  `).run(
    name ?? existing.name, abbr ?? existing.abbr, email ?? existing.email,
    phone ?? existing.phone, website ?? existing.website, description ?? existing.description,
    rating ?? existing.rating, review_count ?? existing.review_count, status ?? existing.status,
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
