const express = require('express');
const router = express.Router();
const db = require('../db');

const JSON_COLS = ['outcomes', 'curriculum', 'included', 'facts', 'marquee_items', 'materials', 'bring_items'];

function parseJSON(row) {
  if (!row) return row;
  JSON_COLS.forEach(col => {
    if (row[col] && typeof row[col] === 'string') {
      try { row[col] = JSON.parse(row[col]); } catch { row[col] = []; }
    }
  });
  return row;
}

router.get('/', (req, res) => {
  const { category, status, supplier } = req.query;
  let sql = `
    SELECT c.*, s.name as supplier_name, s.abbr as supplier_abbr,
           cat.label as category_label, cat.key as category_key, cat.accent as category_accent
    FROM courses c
    LEFT JOIN suppliers s ON s.id = c.supplier_id
    LEFT JOIN categories cat ON cat.id = c.category_id
    WHERE 1=1
  `;
  const params = [];
  if (category) { sql += ' AND cat.key = ?'; params.push(category); }
  if (status)   { sql += ' AND c.status = ?'; params.push(status); }
  if (supplier) { sql += ' AND c.supplier_id = ?'; params.push(supplier); }
  sql += ' ORDER BY c.created_at DESC';
  const rows = db.prepare(sql).all(...params).map(parseJSON);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT c.*, s.name as supplier_name, s.abbr as supplier_abbr, s.email as supplier_email,
           cat.label as category_label, cat.key as category_key, cat.accent as category_accent
    FROM courses c
    LEFT JOIN suppliers s ON s.id = c.supplier_id
    LEFT JOIN categories cat ON cat.id = c.category_id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseJSON(row));
});

function slugify(str) {
  return (str || '').toLowerCase()
    .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'oe').replace(/[å]/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

router.post('/', (req, res) => {
  const {
    title, supplier_id, category_id, price = 0, price_label = 'Pris ekskl. moms',
    price_note = '', format = 'Fysisk', duration = '1 dag', is_online = 0,
    rating = 0, review_count = 0, description = '', short_description = '',
    outcomes = [], curriculum = [], included = [], facts = [],
    marquee_items = [], materials = [], bring_items = [],
    preset_type = 'ledelse', badge = '', color = '#2C1A0A', status = 'active'
  } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const slug = slugify(title);
  const result = db.prepare(`
    INSERT INTO courses (title, slug, supplier_id, category_id, price, price_label, price_note,
      format, duration, is_online, rating, review_count, description, short_description,
      outcomes, curriculum, included, facts, marquee_items, materials, bring_items,
      preset_type, badge, color, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, slug, supplier_id || null, category_id || null, price, price_label, price_note,
    format, duration, is_online ? 1 : 0, rating, review_count, description, short_description,
    JSON.stringify(outcomes), JSON.stringify(curriculum), JSON.stringify(included),
    JSON.stringify(facts), JSON.stringify(marquee_items), JSON.stringify(materials),
    JSON.stringify(bring_items), preset_type, badge, color, status);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM courses WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const body = req.body;
  const merged = { ...existing };
  const directCols = ['title', 'supplier_id', 'category_id', 'price', 'price_label', 'price_note',
    'format', 'duration', 'is_online', 'rating', 'review_count', 'description', 'short_description',
    'preset_type', 'badge', 'color', 'status'];
  directCols.forEach(col => { if (body[col] !== undefined) merged[col] = body[col]; });
  JSON_COLS.forEach(col => {
    if (body[col] !== undefined) merged[col] = JSON.stringify(body[col]);
  });
  if (body.title && body.title !== existing.title) merged.slug = slugify(body.title);
  db.prepare(`
    UPDATE courses SET title=?, slug=?, supplier_id=?, category_id=?, price=?, price_label=?,
      price_note=?, format=?, duration=?, is_online=?, rating=?, review_count=?, description=?,
      short_description=?, outcomes=?, curriculum=?, included=?, facts=?, marquee_items=?,
      materials=?, bring_items=?, preset_type=?, badge=?, color=?, status=?
    WHERE id=?
  `).run(merged.title, merged.slug, merged.supplier_id, merged.category_id, merged.price,
    merged.price_label, merged.price_note, merged.format, merged.duration,
    merged.is_online ? 1 : 0, merged.rating, merged.review_count, merged.description,
    merged.short_description, merged.outcomes, merged.curriculum, merged.included,
    merged.facts, merged.marquee_items, merged.materials, merged.bring_items,
    merged.preset_type, merged.badge, merged.color, merged.status, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM courses WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
