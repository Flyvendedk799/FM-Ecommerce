/* ============================================================
   Validation & error handling: malformed JSON, bad FK, status
   enums, numeric bounds, session date/past validation, GET/:id
   404s, inquiry email/type coercion.
   Covers prompt cases 4, 5, 9, 10, 11, 12, 16.
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

/* ---- 4. Malformed JSON ---- */
test('malformed JSON body -> 400 JSON {error:"Invalid JSON body"}', async () => {
  const r = await j('/api/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ this is not json ',
  });
  assert.strictEqual(r.status, 400);
  assert.ok(r.contentType.includes('application/json'), 'must be JSON, not HTML');
  assert.deepStrictEqual(r.body, { error: 'Invalid JSON body' });
});

/* ---- 5. Bad FK is a clean 4xx JSON, never a 500 ---- */
test('POST /api/sessions with bad course_id -> 4xx JSON (not 500)', async () => {
  const r = await j('/api/sessions', jsonReq('POST',
    { course_id: 999999, date: '2030-01-01', location: 'KBH' }, true));
  assert.ok(r.status >= 400 && r.status < 500, `status ${r.status} should be 4xx`);
  assert.notStrictEqual(r.status, 500);
  assert.ok(r.contentType.includes('application/json'));
});

test('POST /api/bookings with missing session_id -> 404 "Holdet findes ikke"', async () => {
  const r = await j('/api/bookings', jsonReq('POST', {
    session_id: 999999,
    customer_name: 'X',
    customer_email: 'x@example.com',
    participants: 1,
  }));
  assert.strictEqual(r.status, 404);
  assert.ok(r.contentType.includes('application/json'));
  assert.match(r.body.error, /Holdet findes ikke/);
});

/* ---- 9. Status enum on PUT ---- */
test('PUT booking status=done -> 400; valid status ok', async () => {
  // Seed booking id 1 exists (sample booking). Invalid status -> 400.
  const bad = await j('/api/bookings/1', jsonReq('PUT', { status: 'done' }, true));
  assert.strictEqual(bad.status, 400);
  assert.ok(bad.contentType.includes('application/json'));

  const good = await j('/api/bookings/1', jsonReq('PUT', { status: 'confirmed' }, true));
  assert.strictEqual(good.status, 200);
  assert.deepStrictEqual(good.body, { ok: true });
});

test('invalid status on PUT course/session/supplier/inquiry -> 400', async () => {
  // Build fresh targets so we never depend on prior state.
  const c = await j('/api/courses', jsonReq('POST', { title: 'Enum Course ' + Date.now() }, true));
  const courseId = c.body.id;
  const s = await j('/api/suppliers', jsonReq('POST', { name: 'Enum Supplier ' + Date.now() }, true));
  const supplierId = s.body.id;
  const sess = await j('/api/sessions', jsonReq('POST',
    { course_id: courseId, date: '2030-01-01', location: 'KBH' }, true));
  const sessionId = sess.body.id;
  const inq = await j('/api/inquiries', jsonReq('POST', { email: 'enum@example.com', message: 'hi' }));
  const inquiryId = inq.body.id;

  const bad = [
    ['/api/courses/' + courseId,     { status: 'published' }],
    ['/api/sessions/' + sessionId,   { status: 'deleted' }],
    ['/api/suppliers/' + supplierId, { status: 'banned' }],
    ['/api/inquiries/' + inquiryId,  { status: 'closed' }],
  ];
  for (const [path, payload] of bad) {
    const r = await j(path, jsonReq('PUT', payload, true));
    assert.strictEqual(r.status, 400, `${path} invalid status -> 400`);
    assert.ok(r.contentType.includes('application/json'));
  }

  // And a valid status on each succeeds (per each resource's own enum).
  const good = [
    ['/api/courses/' + courseId,     { status: 'archived' }],
    ['/api/sessions/' + sessionId,   { status: 'cancelled' }], // sessions: active|full|cancelled|archived
    ['/api/suppliers/' + supplierId, { status: 'inactive' }],  // suppliers: active|inactive
    ['/api/inquiries/' + inquiryId,  { status: 'handled' }],
  ];
  for (const [path, payload] of good) {
    const r = await j(path, jsonReq('PUT', payload, true));
    assert.strictEqual(r.status, 200, `${path} valid status -> 200`);
  }
});

/* ---- 10. Numeric bounds ---- */
test('booking participants bounds -> 400; valid ok', async () => {
  // Create a roomy future session so a valid booking is not capacity-blocked.
  const sess = await j('/api/sessions', jsonReq('POST',
    { course_id: 1, date: '2030-05-01', location: 'KBH', seats: 50 }, true));
  const sessionId = sess.body.id;

  for (const p of [0, -5, 99999, 'abc']) {
    const r = await j('/api/bookings', jsonReq('POST', {
      session_id: sessionId, customer_name: 'N', customer_email: 'n@example.com', participants: p,
    }));
    assert.strictEqual(r.status, 400, `participants=${p} -> 400`);
    assert.ok(r.contentType.includes('application/json'));
  }

  const ok = await j('/api/bookings', jsonReq('POST', {
    session_id: sessionId, customer_name: 'N', customer_email: 'n@example.com', participants: 2,
  }));
  assert.strictEqual(ok.status, 201);
});

test('course price/rating bounds -> 400; valid ok', async () => {
  const negPrice = await j('/api/courses', jsonReq('POST',
    { title: 'PriceNeg ' + Date.now(), price: -1 }, true));
  assert.strictEqual(negPrice.status, 400);

  const badRating = await j('/api/courses', jsonReq('POST',
    { title: 'RatingHi ' + Date.now(), rating: 99 }, true));
  assert.strictEqual(badRating.status, 400);

  const ok = await j('/api/courses', jsonReq('POST',
    { title: 'RatingOk ' + Date.now(), rating: 4.5 }, true));
  assert.strictEqual(ok.status, 201);
});

test('session seats=-1 -> 400', async () => {
  const r = await j('/api/sessions', jsonReq('POST',
    { course_id: 1, date: '2030-01-01', location: 'KBH', seats: -1 }, true));
  assert.strictEqual(r.status, 400);
  assert.ok(r.contentType.includes('application/json'));
});

/* ---- 11. Session validation ---- */
test('POST /api/sessions date="not-a-date" -> 400', async () => {
  const r = await j('/api/sessions', jsonReq('POST',
    { course_id: 1, date: 'not-a-date', location: 'KBH' }, true));
  assert.strictEqual(r.status, 400);
  assert.ok(r.contentType.includes('application/json'));
});

test('booking a past-dated session -> 409', async () => {
  // Valid ISO format but in the past.
  const sess = await j('/api/sessions', jsonReq('POST',
    { course_id: 1, date: '2020-01-01', location: 'KBH', seats: 10 }, true));
  assert.strictEqual(sess.status, 201);
  const sessionId = sess.body.id;

  const r = await j('/api/bookings', jsonReq('POST', {
    session_id: sessionId, customer_name: 'Late', customer_email: 'late@example.com', participants: 1,
  }));
  assert.strictEqual(r.status, 409);
  assert.ok(r.contentType.includes('application/json'));
  assert.match(r.body.error, /afholdt/);
});

test('booking an archived session -> 409', async () => {
  const sess = await j('/api/sessions', jsonReq('POST',
    { course_id: 1, date: '2030-07-01', location: 'KBH', seats: 10, status: 'archived' }, true));
  const sessionId = sess.body.id;
  const r = await j('/api/bookings', jsonReq('POST', {
    session_id: sessionId, customer_name: 'A', customer_email: 'a@example.com', participants: 1,
  }));
  assert.strictEqual(r.status, 409);
  assert.match(r.body.error, /ikke længere åbent/);
});

/* ---- 12. GET /:id 404 for non-existent ids ---- */
test('GET /:id 404 JSON across resources', async () => {
  const paths = [
    '/api/courses/999999',
    '/api/sessions/999999',
    '/api/suppliers/999999',
    '/api/categories/999999',
    '/api/bookings/999999',     // PII read -> needs token
    '/api/inquiries/999999',    // PII read -> needs token
  ];
  for (const path of paths) {
    const needsAdmin = path.startsWith('/api/bookings') || path.startsWith('/api/inquiries');
    const r = await j(path, needsAdmin ? { headers: ADMIN } : {});
    assert.strictEqual(r.status, 404, `${path} -> 404`);
    assert.ok(r.contentType.includes('application/json'), `${path} 404 is JSON`);
    assert.deepStrictEqual(r.body, { error: 'Not found' });
  }
});

/* ---- 16. Inquiries email + type coercion ---- */
test('inquiry invalid email -> 400; valid -> 201', async () => {
  const bad = await j('/api/inquiries', jsonReq('POST', { email: 'not-an-email', message: 'x' }));
  assert.strictEqual(bad.status, 400);
  assert.ok(bad.contentType.includes('application/json'));

  const good = await j('/api/inquiries', jsonReq('POST',
    { email: 'valid' + Date.now() + '@example.com', message: 'x' }));
  assert.strictEqual(good.status, 201);
  assert.strictEqual(good.body.ok, true);
});

test('inquiry type outside allowed set coerced to "contact"', async () => {
  const email = 'coerce' + Date.now() + '@example.com';
  const created = await j('/api/inquiries', jsonReq('POST',
    { type: 'totally-bogus', email, message: 'x' }));
  assert.strictEqual(created.status, 201);
  const id = created.body.id;

  // Read it back (admin) and confirm the stored type was coerced.
  const got = await j('/api/inquiries/' + id, { headers: ADMIN });
  assert.strictEqual(got.status, 200);
  assert.strictEqual(got.body.type, 'contact');
});
