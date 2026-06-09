const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const { httpError, statusOrDefault, statusStrict, intInRange, isISODate } = require('../validate');

/* ---- auth: reads are public; writes are admin ---- */
router.use((req, res, next) => (req.method === 'GET' ? next() : requireAdmin(req, res, next)));

const MONTHS_DA = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

function enrichSession(s) {
  if (!s) return s;
  const d = new Date(s.date);
  if (Number.isNaN(d.getTime())) {
    s.day = s.month = s.year = null; // never emit 'NaN'/undefined to the UI
    return s;
  }
  s.day = String(d.getDate()).padStart(2, '0');
  s.month = MONTHS_DA[d.getMonth()];
  s.year = d.getFullYear();
  return s;
}

// seats_remaining = capacity − non-cancelled participants. `seats` stays immutable capacity.
const SEATS_REMAINING = `(sess.seats - COALESCE(
  (SELECT SUM(b.participants) FROM bookings b WHERE b.session_id = sess.id AND b.status != 'cancelled'), 0
)) AS seats_remaining`;

router.get('/', (req, res) => {
  const { course_id } = req.query;
  let sql = `
    SELECT sess.*, ${SEATS_REMAINING}, c.title as course_title, s.name as supplier_name
    FROM sessions sess
    LEFT JOIN courses c ON c.id = sess.course_id
    LEFT JOIN suppliers s ON s.id = c.supplier_id
    WHERE 1=1
  `;
  const params = [];
  if (course_id) { sql += ' AND sess.course_id = ?'; params.push(course_id); }
  sql += ' ORDER BY sess.date ASC';
  res.json(db.prepare(sql).all(...params).map(enrichSession));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT sess.*, ${SEATS_REMAINING}, c.title as course_title
    FROM sessions sess
    LEFT JOIN courses c ON c.id = sess.course_id
    WHERE sess.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(enrichSession(row));
});

router.post('/', (req, res) => {
  const { course_id, date, location, venue = '', format = 'Fysisk · 1 dag' } = req.body;
  if (!course_id || !date || !location) {
    throw httpError(400, 'course_id, date and location are required');
  }
  if (!isISODate(date)) throw httpError(400, 'date skal være på formen ÅÅÅÅ-MM-DD');
  const seats     = intInRange(req.body.seats, { min: 0, max: 999, field: 'seats', def: 14 });
  const is_online = req.body.is_online ? 1 : 0;
  const is_popular = req.body.is_popular ? 1 : 0;
  const status    = statusOrDefault(req.body.status, 'session', 'active');

  const result = db.prepare(`
    INSERT INTO sessions (course_id, date, location, venue, format, is_online, seats, is_popular, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(course_id, date, location, venue, format, is_online, seats, is_popular, status);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM sessions WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { date, location, venue, format } = req.body;
  if (date !== undefined && !isISODate(date)) throw httpError(400, 'date skal være på formen ÅÅÅÅ-MM-DD');
  const seats = req.body.seats !== undefined
    ? intInRange(req.body.seats, { min: 0, max: 999, field: 'seats' })
    : existing.seats;
  const status = statusStrict(req.body.status, 'session', existing.status);

  db.prepare(`
    UPDATE sessions SET date=?, location=?, venue=?, format=?, is_online=?, seats=?, is_popular=?, status=?
    WHERE id=?
  `).run(
    date ?? existing.date, location ?? existing.location, venue ?? existing.venue,
    format ?? existing.format,
    req.body.is_online !== undefined ? (req.body.is_online ? 1 : 0) : existing.is_online,
    seats,
    req.body.is_popular !== undefined ? (req.body.is_popular ? 1 : 0) : existing.is_popular,
    status, req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM sessions WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
