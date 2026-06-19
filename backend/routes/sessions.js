const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const wrapAsync = require('../middleware/wrapAsync');
const { httpError, statusOrDefault, statusStrict, intInRange, isISODate, todayISO } = require('../validate');

/* ---- auth: reads are public; writes are admin ---- */
router.use((req, res, next) => (req.method === 'GET' ? next() : requireAdmin(req, res, next)));

const MONTHS_DA = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

function enrichSession(s) {
  if (!s) return s;
  if (s.shopify_variant_data && typeof s.shopify_variant_data === 'string') {
    try { s.shopify_variant_data = JSON.parse(s.shopify_variant_data); } catch { s.shopify_variant_data = {}; }
  }
  const today = todayISO();
  s.is_expired = isISODate(s.date) && s.date < today;
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

router.get('/', wrapAsync(async (req, res) => {
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
  res.json((await db.all(sql, ...params)).map(enrichSession));
}));

router.get('/:id', wrapAsync(async (req, res) => {
  const row = await db.get(`
    SELECT sess.*, ${SEATS_REMAINING}, c.title as course_title
    FROM sessions sess
    LEFT JOIN courses c ON c.id = sess.course_id
    WHERE sess.id = ?
  `, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(enrichSession(row));
}));

router.post('/', wrapAsync(async (req, res) => {
  const {
    course_id, date, location, venue = '', format = 'Fysisk · 1 dag',
    end_date = '', date_text = '', source_variant_sku = '',
    option1_name = '', option1_value = '', option2_name = '', option2_value = '',
    option3_name = '', option3_value = '', variant_inventory_tracker = '',
    variant_inventory_policy = '', variant_fulfillment_service = '',
    variant_barcode = '', variant_image = '', variant_weight_unit = '',
    variant_tax_code = '', shopify_variant_data = {}, last_imported_at = ''
  } = req.body;
  if (!course_id || !date || !location) {
    throw httpError(400, 'course_id, date and location are required');
  }
  if (!isISODate(date)) throw httpError(400, 'date skal være på formen ÅÅÅÅ-MM-DD');
  if (end_date && !isISODate(end_date)) throw httpError(400, 'end_date skal være på formen ÅÅÅÅ-MM-DD');
  const seats     = intInRange(req.body.seats, { min: 0, max: 999, field: 'seats', def: 14 });
  const variant_price = req.body.variant_price !== undefined && req.body.variant_price !== ''
    ? intInRange(req.body.variant_price, { min: 0, max: 10_000_000, field: 'variant_price' })
    : null;
  const variant_compare_at_price = req.body.variant_compare_at_price !== undefined && req.body.variant_compare_at_price !== ''
    ? intInRange(req.body.variant_compare_at_price, { min: 0, max: 10_000_000, field: 'variant_compare_at_price' })
    : null;
  const variant_inventory_qty = req.body.variant_inventory_qty !== undefined && req.body.variant_inventory_qty !== ''
    ? intInRange(req.body.variant_inventory_qty, { min: 0, max: 999_999, field: 'variant_inventory_qty' })
    : null;
  const variant_grams = req.body.variant_grams !== undefined && req.body.variant_grams !== ''
    ? intInRange(req.body.variant_grams, { min: 0, max: 10_000_000, field: 'variant_grams' })
    : null;
  const cost_per_item = req.body.cost_per_item !== undefined && req.body.cost_per_item !== ''
    ? intInRange(req.body.cost_per_item, { min: 0, max: 10_000_000, field: 'cost_per_item' })
    : null;
  const is_online = req.body.is_online ? 1 : 0;
  const is_popular = req.body.is_popular ? 1 : 0;
  const status    = statusOrDefault(req.body.status, 'session', 'active');

  const result = await db.run(`
    INSERT INTO sessions (
      course_id, date, end_date, date_text, location, venue, format, is_online,
      seats, is_popular, status, source_variant_sku, option1_name, option1_value,
      option2_name, option2_value, option3_name, option3_value, variant_price,
      variant_compare_at_price, variant_inventory_tracker, variant_inventory_qty,
      variant_inventory_policy, variant_fulfillment_service, variant_requires_shipping,
      variant_taxable, variant_barcode, variant_image, variant_grams, variant_weight_unit,
      variant_tax_code, cost_per_item, shopify_variant_data, last_imported_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, course_id, date, end_date, date_text, location, venue, format, is_online, seats,
    is_popular, status, source_variant_sku, option1_name, option1_value,
    option2_name, option2_value, option3_name, option3_value, variant_price,
    variant_compare_at_price, variant_inventory_tracker, variant_inventory_qty,
    variant_inventory_policy, variant_fulfillment_service,
    req.body.variant_requires_shipping ? 1 : 0, req.body.variant_taxable ? 1 : 0,
    variant_barcode, variant_image, variant_grams, variant_weight_unit,
    variant_tax_code, cost_per_item, JSON.stringify(shopify_variant_data || {}),
    last_imported_at);
  res.status(201).json({ id: result.lastInsertRowid });
}));

router.put('/:id', wrapAsync(async (req, res) => {
  const existing = await db.get('SELECT * FROM sessions WHERE id=?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { date, end_date, location, venue, format } = req.body;
  if (date !== undefined && !isISODate(date)) throw httpError(400, 'date skal være på formen ÅÅÅÅ-MM-DD');
  if (end_date !== undefined && end_date && !isISODate(end_date)) throw httpError(400, 'end_date skal være på formen ÅÅÅÅ-MM-DD');
  const seats = req.body.seats !== undefined
    ? intInRange(req.body.seats, { min: 0, max: 999, field: 'seats' })
    : existing.seats;
  const status = statusStrict(req.body.status, 'session', existing.status);
  const intOrExisting = (field, max = 10_000_000) => (
    req.body[field] !== undefined && req.body[field] !== ''
      ? intInRange(req.body[field], { min: 0, max, field })
      : existing[field]
  );

  await db.run(`
    UPDATE sessions SET date=?, end_date=?, date_text=?, location=?, venue=?, format=?,
      is_online=?, seats=?, is_popular=?, status=?, source_variant_sku=?,
      option1_name=?, option1_value=?, option2_name=?, option2_value=?,
      option3_name=?, option3_value=?, variant_price=?, variant_compare_at_price=?,
      variant_inventory_tracker=?, variant_inventory_qty=?, variant_inventory_policy=?,
      variant_fulfillment_service=?, variant_requires_shipping=?, variant_taxable=?,
      variant_barcode=?, variant_image=?, variant_grams=?, variant_weight_unit=?,
      variant_tax_code=?, cost_per_item=?, shopify_variant_data=?, last_imported_at=?
    WHERE id=?
  `,
    date ?? existing.date, end_date ?? existing.end_date, req.body.date_text ?? existing.date_text,
    location ?? existing.location, venue ?? existing.venue,
    format ?? existing.format,
    req.body.is_online !== undefined ? (req.body.is_online ? 1 : 0) : existing.is_online,
    seats,
    req.body.is_popular !== undefined ? (req.body.is_popular ? 1 : 0) : existing.is_popular,
    status,
    req.body.source_variant_sku ?? existing.source_variant_sku,
    req.body.option1_name ?? existing.option1_name,
    req.body.option1_value ?? existing.option1_value,
    req.body.option2_name ?? existing.option2_name,
    req.body.option2_value ?? existing.option2_value,
    req.body.option3_name ?? existing.option3_name,
    req.body.option3_value ?? existing.option3_value,
    intOrExisting('variant_price'),
    intOrExisting('variant_compare_at_price'),
    req.body.variant_inventory_tracker ?? existing.variant_inventory_tracker,
    intOrExisting('variant_inventory_qty', 999_999),
    req.body.variant_inventory_policy ?? existing.variant_inventory_policy,
    req.body.variant_fulfillment_service ?? existing.variant_fulfillment_service,
    req.body.variant_requires_shipping !== undefined ? (req.body.variant_requires_shipping ? 1 : 0) : existing.variant_requires_shipping,
    req.body.variant_taxable !== undefined ? (req.body.variant_taxable ? 1 : 0) : existing.variant_taxable,
    req.body.variant_barcode ?? existing.variant_barcode,
    req.body.variant_image ?? existing.variant_image,
    intOrExisting('variant_grams'),
    req.body.variant_weight_unit ?? existing.variant_weight_unit,
    req.body.variant_tax_code ?? existing.variant_tax_code,
    intOrExisting('cost_per_item'),
    req.body.shopify_variant_data !== undefined ? JSON.stringify(req.body.shopify_variant_data || {}) : existing.shopify_variant_data,
    req.body.last_imported_at ?? existing.last_imported_at,
    req.params.id
  );
  res.json({ ok: true });
}));

router.delete('/:id', wrapAsync(async (req, res) => {
  const result = await db.run('DELETE FROM sessions WHERE id=?', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

module.exports = router;
