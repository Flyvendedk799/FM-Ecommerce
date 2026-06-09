const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const wrapAsync = require('../middleware/wrapAsync');
const { statusOrDefault, statusStrict, intInRange, numInRange, jsonArray } = require('../validate');

/* ---- auth: reads are public; writes are admin ---- */
router.use((req, res, next) => (req.method === 'GET' ? next() : requireAdmin(req, res, next)));

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

router.get('/', wrapAsync(async (req, res) => {
  const { category, status, supplier, q } = req.query;
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
  if (q && q.trim()) {
    // free-text search across title, descriptions, supplier and category
    const like = '%' + q.trim().toLowerCase() + '%';
    sql += ` AND (
      LOWER(c.title) LIKE ? OR LOWER(c.short_description) LIKE ? OR
      LOWER(c.description) LIKE ? OR LOWER(s.name) LIKE ? OR LOWER(cat.label) LIKE ?
    )`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY c.created_at DESC';
  const rows = (await db.all(sql, ...params)).map(parseJSON);
  res.json(rows);
}));

router.get('/:id', wrapAsync(async (req, res) => {
  const row = await db.get(`
    SELECT c.*, s.name as supplier_name, s.abbr as supplier_abbr, s.email as supplier_email,
           cat.label as category_label, cat.key as category_key, cat.accent as category_accent
    FROM courses c
    LEFT JOIN suppliers s ON s.id = c.supplier_id
    LEFT JOIN categories cat ON cat.id = c.category_id
    WHERE c.id = ?
  `, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseJSON(row));
}));

function slugify(str) {
  return (str || '').toLowerCase()
    .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'oe').replace(/[å]/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

router.post('/', wrapAsync(async (req, res) => {
  const {
    title, supplier_id, category_id, price_label = 'Pris ekskl. moms',
    price_note = '', format = 'Fysisk', duration = '1 dag', is_online = 0,
    description = '', short_description = '',
    outcomes = [], curriculum = [], included = [], facts = [],
    marquee_items = [], materials = [], bring_items = [],
    preset_type = 'ledelse', badge = '', color = '#2C1A0A'
  } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const price        = intInRange(req.body.price, { min: 0, max: 10_000_000, field: 'price', def: 0 });
  const rating       = numInRange(req.body.rating, { min: 0, max: 5, field: 'rating', def: 0 });
  const review_count = intInRange(req.body.review_count, { min: 0, max: 10_000_000, field: 'review_count', def: 0 });
  const status       = statusOrDefault(req.body.status, 'course', 'active');
  const slug = slugify(title);
  const result = await db.run(`
    INSERT INTO courses (title, slug, supplier_id, category_id, price, price_label, price_note,
      format, duration, is_online, rating, review_count, description, short_description,
      outcomes, curriculum, included, facts, marquee_items, materials, bring_items,
      preset_type, badge, color, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, title, slug, supplier_id || null, category_id || null, price, price_label, price_note,
    format, duration, is_online ? 1 : 0, rating, review_count, description, short_description,
    jsonArray(outcomes), jsonArray(curriculum), jsonArray(included),
    jsonArray(facts), jsonArray(marquee_items), jsonArray(materials),
    jsonArray(bring_items), preset_type, badge, color, status);
  res.status(201).json({ id: result.lastInsertRowid });
}));

router.put('/:id', wrapAsync(async (req, res) => {
  const existing = await db.get('SELECT * FROM courses WHERE id=?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const body = req.body;
  const merged = { ...existing };
  const directCols = ['title', 'supplier_id', 'category_id', 'price_label', 'price_note',
    'format', 'duration', 'is_online', 'description', 'short_description',
    'preset_type', 'badge', 'color'];
  directCols.forEach(col => { if (body[col] !== undefined) merged[col] = body[col]; });
  // validated numerics / status
  if (body.price !== undefined)        merged.price = intInRange(body.price, { min: 0, max: 10_000_000, field: 'price' });
  if (body.rating !== undefined)       merged.rating = numInRange(body.rating, { min: 0, max: 5, field: 'rating' });
  if (body.review_count !== undefined) merged.review_count = intInRange(body.review_count, { min: 0, max: 10_000_000, field: 'review_count' });
  merged.status = statusStrict(body.status, 'course', existing.status);
  JSON_COLS.forEach(col => {
    if (body[col] !== undefined) merged[col] = jsonArray(body[col]);
  });
  if (body.title && body.title !== existing.title) merged.slug = slugify(body.title);
  await db.run(`
    UPDATE courses SET title=?, slug=?, supplier_id=?, category_id=?, price=?, price_label=?,
      price_note=?, format=?, duration=?, is_online=?, rating=?, review_count=?, description=?,
      short_description=?, outcomes=?, curriculum=?, included=?, facts=?, marquee_items=?,
      materials=?, bring_items=?, preset_type=?, badge=?, color=?, status=?
    WHERE id=?
  `, merged.title, merged.slug, merged.supplier_id, merged.category_id, merged.price,
    merged.price_label, merged.price_note, merged.format, merged.duration,
    merged.is_online ? 1 : 0, merged.rating, merged.review_count, merged.description,
    merged.short_description, merged.outcomes, merged.curriculum, merged.included,
    merged.facts, merged.marquee_items, merged.materials, merged.bring_items,
    merged.preset_type, merged.badge, merged.color, merged.status, req.params.id);
  res.json({ ok: true });
}));

router.delete('/:id', wrapAsync(async (req, res) => {
  const result = await db.run('DELETE FROM courses WHERE id=?', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

module.exports = router;
