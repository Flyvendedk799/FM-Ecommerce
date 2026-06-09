/* ============================================================
   Seat-capacity integrity: overbooking blocked, cancelling frees
   capacity, seats_remaining tracks each step, and PUT capacity
   re-checks (excluding the booking's own count).
   Covers prompt cases 7, 8.
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

const seatsRemaining = async (sessionId) => {
  const r = await j('/api/sessions/' + sessionId); // public read
  assert.strictEqual(r.status, 200);
  assert.strictEqual(typeof r.body.seats_remaining, 'number',
    'seats_remaining must be numeric');
  return r.body.seats_remaining;
};

/* ---- 7. Seat capacity lifecycle on a 2-seat session ---- */
test('seat capacity: fill, reject overflow, cancel to free, re-book', async () => {
  const sess = await j('/api/sessions', jsonReq('POST',
    { course_id: 1, date: '2030-06-01', location: 'KBH', seats: 2 }, true));
  assert.strictEqual(sess.status, 201);
  const sessionId = sess.body.id;

  assert.strictEqual(await seatsRemaining(sessionId), 2, 'fresh session has 2 seats');

  // Book 2 participants -> fills it.
  const b1 = await j('/api/bookings', jsonReq('POST', {
    session_id: sessionId, customer_name: 'First', customer_email: 'first@example.com', participants: 2,
  }));
  assert.strictEqual(b1.status, 201);
  const firstBookingId = b1.body.id;
  assert.strictEqual(await seatsRemaining(sessionId), 0, 'session now full');

  // One more participant -> 409 Holdet er fuldt.
  const b2 = await j('/api/bookings', jsonReq('POST', {
    session_id: sessionId, customer_name: 'Second', customer_email: 'second@example.com', participants: 1,
  }));
  assert.strictEqual(b2.status, 409);
  assert.match(b2.body.error, /fuldt/);
  assert.strictEqual(await seatsRemaining(sessionId), 0, 'still full after rejection');

  // Cancel the first booking (admin) -> frees capacity.
  const cancel = await j('/api/bookings/' + firstBookingId,
    jsonReq('PUT', { status: 'cancelled' }, true));
  assert.strictEqual(cancel.status, 200);
  assert.strictEqual(await seatsRemaining(sessionId), 2, 'capacity freed after cancel');

  // Now a 1-participant booking succeeds.
  const b3 = await j('/api/bookings', jsonReq('POST', {
    session_id: sessionId, customer_name: 'Third', customer_email: 'third@example.com', participants: 1,
  }));
  assert.strictEqual(b3.status, 201);
  assert.strictEqual(await seatsRemaining(sessionId), 1, 'one seat left after re-book');
});

/* ---- 8. PUT booking capacity re-check ---- */
test('PUT booking: increase beyond remaining -> 409; valid change ok; own count excluded', async () => {
  // 5-seat session, two bookings: A=2, B=2 (4 used, 1 remaining).
  const sess = await j('/api/sessions', jsonReq('POST',
    { course_id: 1, date: '2030-06-02', location: 'KBH', seats: 5 }, true));
  const sessionId = sess.body.id;

  const a = await j('/api/bookings', jsonReq('POST', {
    session_id: sessionId, customer_name: 'A', customer_email: 'a@example.com', participants: 2,
  }));
  const bookingA = a.body.id;
  const b = await j('/api/bookings', jsonReq('POST', {
    session_id: sessionId, customer_name: 'B', customer_email: 'b@example.com', participants: 2,
  }));
  assert.strictEqual(b.status, 201);
  assert.strictEqual(await seatsRemaining(sessionId), 1, '4 of 5 used');

  // Try to bump A from 2 -> 4: others use 2, 2+4=6 > 5 -> 409.
  const tooBig = await j('/api/bookings/' + bookingA, jsonReq('PUT', { participants: 4 }, true));
  assert.strictEqual(tooBig.status, 409);
  assert.match(tooBig.body.error, /fuldt/);

  // Valid bump A from 2 -> 3: others use 2, 2+3=5 <= 5 -> ok. Own count excluded
  // from the check (otherwise current 2 + new 3 would falsely overflow).
  const okBump = await j('/api/bookings/' + bookingA, jsonReq('PUT', { participants: 3 }, true));
  assert.strictEqual(okBump.status, 200);
  assert.strictEqual(await seatsRemaining(sessionId), 0, 'now exactly full (2+3)');

  // Confirm persisted via PII read.
  const readA = await j('/api/bookings/' + bookingA, { headers: ADMIN });
  assert.strictEqual(readA.body.participants, 3);
});
