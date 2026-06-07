const express = require('express');
const router = express.Router();
const db = require('../db');

const MONTHS_DA = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

function enrichSession(s) {
  if (!s) return s;
  const d = new Date(s.date);
  s.day = String(d.getDate()).padStart(2, '0');
  s.month = MONTHS_DA[d.getMonth()];
  s.year = d.getFullYear();
  return s;
}

router.get('/', (req, res) => {
  const { course_id } = req.query;
  let sql = `
    SELECT sess.*, c.title as course_title, s.name as supplier_name
    FROM sessions sess
    LEFT JOIN courses c ON c.id = sess.course_id
    LEFT JOIN suppliers s ON s.id = c.supplier_id
    WHERE 1=1
  `;
  const params = [];
  if (course_id) { sql += ' AND sess.course_id = ?'; params.push(course_id); }
  sql += ' ORDER BY sess.date ASC';
  const rows = db.prepare(sql).all(...params).map(enrichSession);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT sess.*, c.title as course_title
    FROM sessions sess
    LEFT JOIN courses c ON c.id = sess.course_id
    WHERE sess.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(enrichSession(row));
});

router.post('/', (req, res) => {
  const { course_id, date, location, venue = '', format = 'Fysisk · 1 dag',
          is_online = 0, seats = 14, is_popular = 0, status = 'active' } = req.body;
  if (!course_id || !date || !location) {
    return res.status(400).json({ error: 'course_id, date and location are required' });
  }
  const result = db.prepare(`
    INSERT INTO sessions (course_id, date, location, venue, format, is_online, seats, is_popular, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(course_id, date, location, venue, format, is_online ? 1 : 0, seats, is_popular ? 1 : 0, status);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM sessions WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { date, location, venue, format, is_online, seats, is_popular, status } = req.body;
  db.prepare(`
    UPDATE sessions SET date=?, location=?, venue=?, format=?, is_online=?, seats=?, is_popular=?, status=?
    WHERE id=?
  `).run(
    date ?? existing.date, location ?? existing.location, venue ?? existing.venue,
    format ?? existing.format, is_online !== undefined ? (is_online ? 1 : 0) : existing.is_online,
    seats ?? existing.seats, is_popular !== undefined ? (is_popular ? 1 : 0) : existing.is_popular,
    status ?? existing.status, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM sessions WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
