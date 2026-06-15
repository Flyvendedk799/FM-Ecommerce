const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const wrapAsync = require('../middleware/wrapAsync');
const { httpError, intInRange, isEmail, isISODate, todayISO } = require('../validate');

const PAYMENT_METHODS = ['faktura', 'ean', 'kort', 'mobilepay', 'stripe_later'];
const VAT_RATE = 0.25;

async function bookedSeats(ex, sessionId) {
  const row = await ex.get(
    `SELECT COALESCE(SUM(participants), 0) AS n FROM bookings
     WHERE session_id = ? AND status != 'cancelled'`,
    sessionId
  );
  return row.n;
}

function clean(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function paymentOrDefault(value) {
  return PAYMENT_METHODS.includes(value) ? value : 'faktura';
}

function orderReference() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `FM-${stamp}-${suffix}`;
}

function lineDiscount(subtotal, participants) {
  return participants >= 3 ? Math.round(subtotal * 0.10) : 0;
}

async function loadSession(ex, sessionId) {
  return ex.get(`
    SELECT sess.*, c.title AS course_title, c.price, c.badge, c.status AS course_status,
           s.name AS supplier_name
    FROM sessions sess
    LEFT JOIN courses c ON c.id = sess.course_id
    LEFT JOIN suppliers s ON s.id = c.supplier_id
    WHERE sess.id = ?
  `, sessionId);
}

router.post('/', wrapAsync(async (req, res) => {
  const body = req.body || {};
  const customer = body.customer || {};
  const billing = body.billing || {};
  const items = Array.isArray(body.items) ? body.items : [];

  const customerName = clean(customer.name, 160);
  const customerEmail = clean(customer.email, 180).toLowerCase();
  if (!customerName) throw httpError(400, 'Navn er påkrævet');
  if (!isEmail(customerEmail)) throw httpError(400, 'En gyldig e-mail er påkrævet');
  if (!items.length) throw httpError(400, 'Kurven er tom');

  const paymentMethod = paymentOrDefault(body.payment_method);
  const today = todayISO();

  const order = await db.transaction(async (tx) => {
    const normalized = [];
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const sessionId = intInRange(item.session_id, { min: 1, max: 10_000_000, field: `Hold #${idx + 1}` });
      const participants = intInRange(item.participants, { min: 1, max: 999, field: 'Antal deltagere', def: 1 });
      const session = await loadSession(tx, sessionId);
      if (!session) throw httpError(404, 'Et valgt hold findes ikke længere');
      if (session.course_status !== 'active') throw httpError(409, `${session.course_title || 'Kurset'} er ikke længere aktivt`);
      if (session.status !== 'active') throw httpError(409, `${session.course_title || 'Holdet'} er ikke længere åbent for tilmelding`);
      if (isISODate(session.date) && session.date < today) throw httpError(409, `${session.course_title || 'Holdet'} er allerede afholdt`);

      const unitPrice = Math.max(0, Number(session.price || 0));
      const subtotal = unitPrice * participants;
      const discount = lineDiscount(subtotal, participants);
      normalized.push({
        session,
        participants,
        unitPrice,
        discount,
        lineTotal: subtotal - discount,
      });
    }

    const perSession = new Map();
    normalized.forEach(line => {
      const current = perSession.get(line.session.id) || 0;
      perSession.set(line.session.id, current + line.participants);
    });

    for (const [sessionId, participants] of perSession.entries()) {
      const session = normalized.find(line => line.session.id === sessionId).session;
      if (await bookedSeats(tx, sessionId) + participants > session.seats) {
        throw httpError(409, `${session.course_title || 'Holdet'} har ikke nok ledige pladser`);
      }
    }

    const subtotalExVat = normalized.reduce((sum, line) => sum + (line.unitPrice * line.participants), 0);
    const discountTotal = normalized.reduce((sum, line) => sum + line.discount, 0);
    const totalExVat = subtotalExVat - discountTotal;
    const vatTotal = Math.round(totalExVat * VAT_RATE);
    const totalIncVat = totalExVat + vatTotal;
    const reference = orderReference();

    const orderResult = await tx.run(`
      INSERT INTO orders (
        reference, customer_name, customer_email, customer_company, customer_phone,
        billing_address, billing_zip, billing_city, billing_country, ean, vat_number,
        payment_method, subtotal_ex_vat, discount_total, total_ex_vat, vat_total,
        total_inc_vat, currency, status, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DKK', 'pending', ?)
    `,
      reference,
      customerName,
      customerEmail,
      clean(customer.company, 180),
      clean(customer.phone, 80),
      clean(billing.address, 240),
      clean(billing.zip, 40),
      clean(billing.city, 120),
      clean(billing.country || 'Danmark', 80),
      clean(billing.ean, 40),
      clean(billing.vat_number, 60),
      paymentMethod,
      subtotalExVat,
      discountTotal,
      totalExVat,
      vatTotal,
      totalIncVat,
      clean(body.notes, 1000)
    );

    const orderId = orderResult.lastInsertRowid;
    const bookingIds = [];
    for (const line of normalized) {
      const result = await tx.run(`
        INSERT INTO bookings (
          order_id, session_id, customer_name, customer_email, customer_company,
          customer_phone, participants, payment_method, unit_price, discount,
          line_total, notes, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `,
        orderId,
        line.session.id,
        customerName,
        customerEmail,
        clean(customer.company, 180),
        clean(customer.phone, 80),
        line.participants,
        paymentMethod,
        line.unitPrice,
        line.discount,
        line.lineTotal,
        `Ordre ${reference}${body.notes ? ' - ' + clean(body.notes, 600) : ''}`
      );
      bookingIds.push(result.lastInsertRowid);
    }

    return {
      id: orderId,
      reference,
      subtotal_ex_vat: subtotalExVat,
      discount_total: discountTotal,
      total_ex_vat: totalExVat,
      vat_total: vatTotal,
      total_inc_vat: totalIncVat,
      currency: 'DKK',
      status: 'pending',
      booking_ids: bookingIds,
    };
  });

  res.status(201).json({ ok: true, order });
}));

module.exports = router;
