const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const wrapAsync = require('../middleware/wrapAsync');
const { httpError } = require('../validate');

const ORDER_STATUSES = ['pending', 'confirmed', 'cancelled'];

function itemsSql(cols) {
  return `
  SELECT ${cols}, sess.date, sess.end_date, sess.location, sess.venue, sess.format,
         sess.is_online, sess.date_text,
         c.id AS course_id, c.title AS course_title, c.badge, c.duration, c.image_src,
         s.name AS supplier_name
  FROM bookings b
  LEFT JOIN sessions sess ON sess.id = b.session_id
  LEFT JOIN courses c ON c.id = sess.course_id
  LEFT JOIN suppliers s ON s.id = c.supplier_id
  WHERE b.order_id = ?
  ORDER BY b.id ASC
`;
}
// The customer-facing lookup returns only what Min side needs; admin gets b.*.
const PUBLIC_ITEMS_SQL = itemsSql('b.id, b.session_id, b.participants, b.unit_price, b.discount, b.line_total, b.status');
const ADMIN_ITEMS_SQL = itemsSql('b.*');

/* ---- public: a customer fetches their own order — reference AND e-mail
   must both match, so the reference alone leaks nothing. ---- */
router.post('/lookup', wrapAsync(async (req, res) => {
  const reference = String(req.body.reference || '').trim().toUpperCase();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!reference || !email) throw httpError(400, 'Ordrenummer og e-mail er påkrævet');
  const order = await db.get(
    'SELECT * FROM orders WHERE UPPER(reference) = ? AND LOWER(customer_email) = ?',
    reference, email
  );
  if (!order) return res.status(404).json({ error: 'Ingen ordre matcher det ordrenummer og den e-mail' });
  const items = await db.all(PUBLIC_ITEMS_SQL, order.id);
  res.json({ ...order, items });
}));

router.use(requireAdmin);

function statusStrict(value, current) {
  if (value === undefined) return current;
  if (!ORDER_STATUSES.includes(value)) {
    throw httpError(400, `Ugyldig ordrestatus "${value}" (tilladt: ${ORDER_STATUSES.join(', ')})`);
  }
  return value;
}

router.get('/', wrapAsync(async (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT o.*,
           COUNT(b.id) AS item_count,
           COALESCE(SUM(b.participants), 0) AS participants_count,
           MIN(c.title) AS first_course_title
    FROM orders o
    LEFT JOIN bookings b ON b.order_id = o.id
    LEFT JOIN sessions sess ON sess.id = b.session_id
    LEFT JOIN courses c ON c.id = sess.course_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  sql += `
    GROUP BY o.id
    ORDER BY o.created_at DESC, o.id DESC
  `;
  res.json(await db.all(sql, ...params));
}));

router.get('/:id', wrapAsync(async (req, res) => {
  const order = await db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  const items = await db.all(ADMIN_ITEMS_SQL, order.id);
  res.json({ ...order, items });
}));

router.put('/:id', wrapAsync(async (req, res) => {
  const existing = await db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const status = statusStrict(req.body.status, existing.status);
  const notes = req.body.notes ?? existing.notes;

  await db.transaction(async (tx) => {
    await tx.run('UPDATE orders SET status = ?, notes = ? WHERE id = ?', status, notes, existing.id);
    if (status !== existing.status) {
      await tx.run('UPDATE bookings SET status = ? WHERE order_id = ?', status, existing.id);
    }
  });
  res.json({ ok: true });
}));

module.exports = router;
