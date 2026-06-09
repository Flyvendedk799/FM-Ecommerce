const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const { statusStrict, isEmail, httpError } = require('../validate');

/* ---- auth: only the public create (POST '/') is open; the rest is admin (PII) ---- */
router.use((req, res, next) =>
  (req.method === 'POST' && req.path === '/') ? next() : requireAdmin(req, res, next));

const VALID_TYPES = ['contact', 'firmahold', 'notify', 'udbyder'];

router.get('/', (req, res) => {
  const { type, status } = req.query;
  let sql = `
    SELECT i.*, c.title AS course_title_live
    FROM inquiries i
    LEFT JOIN courses c ON c.id = i.course_id
    WHERE 1=1
  `;
  const params = [];
  if (type)   { sql += ' AND i.type = ?';   params.push(type); }
  if (status) { sql += ' AND i.status = ?'; params.push(status); }
  sql += ' ORDER BY i.created_at DESC, i.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM inquiries WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const {
    type = 'contact', name = '', email, phone = '', company = '',
    subject = '', message = '', course_id = null, course_title = '',
    participants = null,
  } = req.body;

  if (!isEmail(email)) {
    throw httpError(400, 'En gyldig e-mail er påkrævet');
  }
  const safeType = VALID_TYPES.includes(type) ? type : 'contact';

  const result = db.prepare(`
    INSERT INTO inquiries (type, name, email, phone, company, subject, message, course_id, course_title, participants)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(safeType, name, email, phone, company, subject, message,
         course_id || null, course_title, participants || null);

  res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM inquiries WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const status = statusStrict(req.body.status, 'inquiry', existing.status);
  const message = req.body.message ?? existing.message;
  db.prepare('UPDATE inquiries SET status=?, message=? WHERE id=?').run(status, message, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM inquiries WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
