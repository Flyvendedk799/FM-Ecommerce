const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { status, session_id } = req.query;
  let sql = `
    SELECT b.*, sess.date, sess.location, c.title as course_title
    FROM bookings b
    LEFT JOIN sessions sess ON sess.id = b.session_id
    LEFT JOIN courses c ON c.id = sess.course_id
    WHERE 1=1
  `;
  const params = [];
  if (status)     { sql += ' AND b.status = ?'; params.push(status); }
  if (session_id) { sql += ' AND b.session_id = ?'; params.push(session_id); }
  sql += ' ORDER BY b.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT b.*, sess.date, sess.location, sess.venue, c.title as course_title
    FROM bookings b
    LEFT JOIN sessions sess ON sess.id = b.session_id
    LEFT JOIN courses c ON c.id = sess.course_id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { session_id, customer_name, customer_email, customer_company = '',
          customer_phone = '', participants = 1, payment_method = 'faktura',
          notes = '', status = 'pending' } = req.body;
  if (!customer_name || !customer_email) {
    return res.status(400).json({ error: 'customer_name and customer_email required' });
  }
  const result = db.prepare(`
    INSERT INTO bookings (session_id, customer_name, customer_email, customer_company,
      customer_phone, participants, payment_method, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(session_id || null, customer_name, customer_email, customer_company,
    customer_phone, participants, payment_method, notes, status);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { status, notes, participants, payment_method } = req.body;
  db.prepare(`
    UPDATE bookings SET status=?, notes=?, participants=?, payment_method=? WHERE id=?
  `).run(
    status ?? existing.status, notes ?? existing.notes,
    participants ?? existing.participants, payment_method ?? existing.payment_method,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM bookings WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

/* ---- stats endpoint ---- */
router.get('/stats/summary', (req, res) => {
  const stats = {
    total_courses:     db.prepare("SELECT COUNT(*) as n FROM courses WHERE status='active'").get().n,
    draft_courses:     db.prepare("SELECT COUNT(*) as n FROM courses WHERE status='draft'").get().n,
    total_suppliers:   db.prepare("SELECT COUNT(*) as n FROM suppliers WHERE status='active'").get().n,
    total_sessions:    db.prepare("SELECT COUNT(*) as n FROM sessions WHERE status='active'").get().n,
    pending_bookings:  db.prepare("SELECT COUNT(*) as n FROM bookings WHERE status='pending'").get().n,
    confirmed_bookings:db.prepare("SELECT COUNT(*) as n FROM bookings WHERE status='confirmed'").get().n,
    total_bookings:    db.prepare("SELECT COUNT(*) as n FROM bookings").get().n,
    recent_courses:    db.prepare(`
      SELECT c.title, c.status, c.price, c.rating, s.name as supplier_name, cat.label as category_label
      FROM courses c
      LEFT JOIN suppliers s ON s.id = c.supplier_id
      LEFT JOIN categories cat ON cat.id = c.category_id
      ORDER BY c.created_at DESC LIMIT 5
    `).all(),
    recent_bookings: db.prepare(`
      SELECT b.*, c.title as course_title, sess.date, sess.location
      FROM bookings b
      LEFT JOIN sessions sess ON sess.id = b.session_id
      LEFT JOIN courses c ON c.id = sess.course_id
      ORDER BY b.created_at DESC LIMIT 5
    `).all(),
  };
  res.json(stats);
});

module.exports = router;
