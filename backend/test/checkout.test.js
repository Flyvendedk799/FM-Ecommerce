/* ============================================================
   Checkout/order flow: public cart checkout creates a grouped order
   and linked bookings atomically, while capacity failures roll back.
   ============================================================ */
'use strict';
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_TOKEN = 'test-token';

const test = require('node:test');
const assert = require('node:assert');
const app = require('../app');
const { ADMIN, boot, makeClient, jsonReq } = require('../test-helpers');

let server, base;
const j = makeClient(() => base);

test.before(() => { ({ server, base } = boot(app)); });
test.after(() => server.close());

async function makeFutureSession(seats = 6) {
  const sess = await j('/api/sessions', jsonReq('POST', {
    course_id: 1,
    date: '2030-08-01',
    location: 'København',
    venue: 'Test venue',
    seats,
  }, true));
  assert.strictEqual(sess.status, 201);
  return sess.body.id;
}

test('POST /api/checkout creates an order with linked bookings and totals', async () => {
  const sessionId = await makeFutureSession(4);

  const created = await j('/api/checkout', jsonReq('POST', {
    customer: {
      name: 'Checkout Kunde',
      email: 'checkout@example.com',
      company: 'Future Buyer A/S',
      phone: '12345678',
    },
    billing: {
      address: 'Testvej 1',
      zip: '1000',
      city: 'København',
      ean: '5790000000000',
      vat_number: '12345678',
    },
    payment_method: 'faktura',
    items: [{ session_id: sessionId, participants: 3 }],
  }));

  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.ok, true);
  assert.match(created.body.order.reference, /^FM-\d{6}-[A-F0-9]{6}$/);
  assert.strictEqual(created.body.order.subtotal_ex_vat, 20_700);
  assert.strictEqual(created.body.order.discount_total, 2_070);
  assert.strictEqual(created.body.order.total_ex_vat, 18_630);
  assert.strictEqual(created.body.order.vat_total, 4_658);
  assert.strictEqual(created.body.order.total_inc_vat, 23_288);
  assert.strictEqual(created.body.order.booking_ids.length, 1);

  const order = await j('/api/orders/' + created.body.order.id, { headers: ADMIN });
  assert.strictEqual(order.status, 200);
  assert.strictEqual(order.body.customer_email, 'checkout@example.com');
  assert.strictEqual(order.body.items.length, 1);
  assert.strictEqual(order.body.items[0].participants, 3);
  assert.strictEqual(order.body.items[0].line_total, 18_630);
  assert.strictEqual(order.body.items[0].order_id, created.body.order.id);

  const sess = await j('/api/sessions/' + sessionId);
  assert.strictEqual(sess.body.seats_remaining, 1);

  const confirm = await j('/api/orders/' + created.body.order.id,
    jsonReq('PUT', { status: 'confirmed' }, true));
  assert.strictEqual(confirm.status, 200);

  const booking = await j('/api/bookings/' + created.body.order.booking_ids[0], { headers: ADMIN });
  assert.strictEqual(booking.body.status, 'confirmed');
  assert.strictEqual(booking.body.order_reference, created.body.order.reference);
});

test('POST /api/checkout rolls back when capacity is insufficient', async () => {
  const sessionId = await makeFutureSession(2);
  const before = await j('/api/orders', { headers: ADMIN });
  assert.strictEqual(before.status, 200);

  const failed = await j('/api/checkout', jsonReq('POST', {
    customer: { name: 'Too Many', email: 'toomany@example.com' },
    items: [{ session_id: sessionId, participants: 3 }],
  }));

  assert.strictEqual(failed.status, 409);
  assert.match(failed.body.error, /ikke nok ledige pladser/);

  const after = await j('/api/orders', { headers: ADMIN });
  assert.strictEqual(after.body.length, before.body.length, 'no order inserted on failed checkout');

  const sess = await j('/api/sessions/' + sessionId);
  assert.strictEqual(sess.body.seats_remaining, 2, 'capacity unchanged after rollback');
});
