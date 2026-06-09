const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const wrapAsync = require('../middleware/wrapAsync');
const { getStats } = require('../stats');
const { httpError, statusOrDefault, statusStrict, intInRange, isISODate, todayISO } = require('../validate');

/* ---- auth: only the public create (POST '/') is open; the rest is admin (PII) ---- */
router.use((req, res, next) =>
  (req.method === 'POST' && req.path === '/') ? next() : requireAdmin(req, res, next));

// Seats already booked on a session (excludes cancelled and, optionally, one booking).
// `ex` is the executor (the transaction handle, so the count is read inside the tx).
async function bookedSeats(ex, sessionId, excludeBookingId) {
  const row = await ex.get(
    `SELECT COALESCE(SUM(participants), 0) AS n FROM bookings
     WHERE session_id = ? AND status != 'cancelled' AND id != ?`,
    sessionId, excludeBookingId == null ? -1 : excludeBookingId);
  return row.n;
}

router.get('/', wrapAsync(async (req, res) => {
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
  res.json(await db.all(sql, ...params));
}));

/* ---- stats summary (admin) — defined before '/:id' is irrelevant since it's 2 segments ---- */
router.get('/stats/summary', wrapAsync(async (req, res) => res.json(await getStats())));

router.get('/:id', wrapAsync(async (req, res) => {
  const row = await db.get(`
    SELECT b.*, sess.date, sess.location, sess.venue, c.title as course_title
    FROM bookings b
    LEFT JOIN sessions sess ON sess.id = b.session_id
    LEFT JOIN courses c ON c.id = sess.course_id
    WHERE b.id = ?
  `, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
}));

router.post('/', wrapAsync(async (req, res) => {
  const { session_id = null, customer_name, customer_email, customer_company = '',
          customer_phone = '', notes = '' } = req.body;
  if (!customer_name || !customer_email) {
    throw httpError(400, 'customer_name and customer_email required');
  }
  const participants   = intInRange(req.body.participants, { min: 1, max: 999, field: 'Antal deltagere', def: 1 });
  const payment_method = req.body.payment_method || 'faktura';
  const status         = statusOrDefault(req.body.status, 'booking', 'pending');

  // Capacity-checked insert in one transaction (no overbooking, even concurrently).
  const result = await db.transaction(async (tx) => {
    if (session_id != null) {
      const sess = await tx.get('SELECT id, seats, status, date FROM sessions WHERE id=?', session_id);
      if (!sess) throw httpError(404, 'Holdet findes ikke');
      if (sess.status !== 'active') throw httpError(409, 'Holdet er ikke længere åbent for tilmelding');
      if (isISODate(sess.date) && sess.date < todayISO()) throw httpError(409, 'Holdet er allerede afholdt');
      if (await bookedSeats(tx, session_id, null) + participants > sess.seats) {
        throw httpError(409, 'Holdet er fuldt — der er ikke plads nok');
      }
    }
    return tx.run(`
      INSERT INTO bookings (session_id, customer_name, customer_email, customer_company,
        customer_phone, participants, payment_method, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, session_id, customer_name, customer_email, customer_company,
      customer_phone, participants, payment_method, notes, status);
  });

  res.status(201).json({ id: result.lastInsertRowid });
}));

router.put('/:id', wrapAsync(async (req, res) => {
  const existing = await db.get('SELECT * FROM bookings WHERE id=?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const status       = statusStrict(req.body.status, 'booking', existing.status);
  const notes        = req.body.notes ?? existing.notes;
  const payment      = req.body.payment_method ?? existing.payment_method;
  const participants = req.body.participants !== undefined
    ? intInRange(req.body.participants, { min: 1, max: 999, field: 'Antal deltagere' })
    : existing.participants;

  await db.transaction(async (tx) => {
    // Re-check capacity if still an active booking on a session and the count went up.
    if (existing.session_id != null && status !== 'cancelled') {
      const sess = await tx.get('SELECT seats FROM sessions WHERE id=?', existing.session_id);
      if (sess && await bookedSeats(tx, existing.session_id, existing.id) + participants > sess.seats) {
        throw httpError(409, 'Holdet er fuldt — kan ikke øge antal deltagere');
      }
    }
    await tx.run('UPDATE bookings SET status=?, notes=?, participants=?, payment_method=? WHERE id=?',
      status, notes, participants, payment, req.params.id);
  });
  res.json({ ok: true });
}));

router.delete('/:id', wrapAsync(async (req, res) => {
  const result = await db.run('DELETE FROM bookings WHERE id=?', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

module.exports = router;
