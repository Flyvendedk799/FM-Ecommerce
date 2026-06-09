/* ============================================================
   Access control: auth gate on writes + PII reads, public-open
   endpoints, and the JSON 404 for unknown /api routes.
   Covers prompt cases 1, 2, 3, 6.
   ============================================================ */
'use strict';
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_TOKEN = 'test-token';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'abe12345';

const test = require('node:test');
const assert = require('node:assert');
const app = require('../app');
const { ADMIN, boot, makeClient, jsonReq } = require('../test-helpers');

let server, base;
const j = makeClient(() => base);

test.before(() => { ({ server, base } = boot(app)); });
test.after(() => server.close());

/* ---- 1. Auth gate on mutating endpoints: 401 without token ---- */
test('writes require admin token (401 without)', async () => {
  const cases = [
    ['POST',   '/api/courses',     { title: 'X' }],
    ['PUT',    '/api/courses/1',   { title: 'X' }],
    ['DELETE', '/api/courses/1',   null],
    ['POST',   '/api/suppliers',   { name: 'X' }],
    ['PUT',    '/api/suppliers/1', { name: 'X' }],
    ['DELETE', '/api/suppliers/1', null],
    ['POST',   '/api/sessions',    { course_id: 1, date: '2030-01-01', location: 'KBH' }],
    ['PUT',    '/api/sessions/1',  { location: 'X' }],
    ['DELETE', '/api/sessions/1',  null],
    ['PUT',    '/api/categories/1',{ label: 'X' }],
    ['PUT',    '/api/bookings/1',  { status: 'confirmed' }],
    ['DELETE', '/api/bookings/1',  null],
    ['PUT',    '/api/inquiries/1', { status: 'handled' }],
    ['DELETE', '/api/inquiries/1', null],
  ];
  for (const [method, path, payload] of cases) {
    const init = payload
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      : { method };
    const r = await j(path, init);
    assert.strictEqual(r.status, 401, `${method} ${path} should be 401 without token`);
    assert.ok(r.contentType.includes('application/json'), `${method} ${path} 401 should be JSON`);
  }
});

test('writes succeed (non-401) WITH admin token', async () => {
  // Create a fresh course/supplier/session so PUT/DELETE have real targets.
  const c = await j('/api/courses', jsonReq('POST', { title: 'Auth Course ' + Date.now() }, true));
  assert.strictEqual(c.status, 201);
  const courseId = c.body.id;

  const s = await j('/api/suppliers', jsonReq('POST', { name: 'Auth Supplier ' + Date.now() }, true));
  assert.strictEqual(s.status, 201);
  const supplierId = s.body.id;

  const sess = await j('/api/sessions', jsonReq('POST',
    { course_id: courseId, date: '2030-01-01', location: 'KBH' }, true));
  assert.strictEqual(sess.status, 201);
  const sessionId = sess.body.id;

  const ok = [
    ['PUT',    `/api/courses/${courseId}`,    { badge: 'Ny' }],
    ['PUT',    `/api/suppliers/${supplierId}`,{ phone: '12345678' }],
    ['PUT',    `/api/sessions/${sessionId}`,  { location: 'Aarhus' }],
    ['PUT',    `/api/categories/1`,           { description: 'updated' }],
  ];
  for (const [method, path, payload] of ok) {
    const r = await j(path, jsonReq(method, payload, true));
    assert.strictEqual(r.status, 200, `${method} ${path} should be 200 with token`);
    assert.deepStrictEqual(r.body, { ok: true });
  }

  // DELETE the created rows (also exercises authorized DELETE).
  for (const path of [`/api/sessions/${sessionId}`, `/api/courses/${courseId}`, `/api/suppliers/${supplierId}`]) {
    const r = await j(path, { method: 'DELETE', headers: ADMIN });
    assert.strictEqual(r.status, 200, `DELETE ${path} with token`);
    assert.deepStrictEqual(r.body, { ok: true });
  }
});

/* ---- 2. PII reads gated ---- */
test('PII reads are 401 without token, 200 with', async () => {
  // The seed creates sample bookings (so booking id 1 exists) but NO inquiries,
  // so create one to give the inquiry /:id read a real 200 target.
  const inq = await j('/api/inquiries', jsonReq('POST',
    { email: 'piiseed@example.com', message: 'hi' }));
  assert.strictEqual(inq.status, 201);
  const inquiryId = inq.body.id;

  const piiPaths = [
    '/api/bookings',
    '/api/bookings/1',                  // seeded sample booking
    '/api/bookings/stats/summary',
    '/api/inquiries',
    `/api/inquiries/${inquiryId}`,
    '/api/stats',
  ];
  for (const path of piiPaths) {
    const noTok = await j(path);
    assert.strictEqual(noTok.status, 401, `${path} should be 401 without token`);
    assert.ok(noTok.contentType.includes('application/json'), `${path} 401 should be JSON`);

    const withTok = await j(path, { headers: ADMIN });
    assert.strictEqual(withTok.status, 200, `${path} should be 200 with token`);
    assert.ok(withTok.contentType.includes('application/json'), `${path} 200 should be JSON`);
  }
});

/* ---- 3. Public-open endpoints ---- */
test('public GET reads are 200 without token', async () => {
  for (const path of ['/api/courses', '/api/categories', '/api/suppliers', '/api/sessions']) {
    const r = await j(path);
    assert.strictEqual(r.status, 200, `${path} public read`);
    assert.ok(Array.isArray(r.body), `${path} returns an array`);
  }
});

test('public POST /api/bookings succeeds with NO token', async () => {
  const r = await j('/api/bookings', jsonReq('POST', {
    customer_name: 'Public Person',
    customer_email: 'public@example.com',
    participants: 1,
  })); // no admin header
  assert.strictEqual(r.status, 201);
  assert.ok(typeof r.body.id === 'number');
});

test('public POST /api/inquiries succeeds with NO token', async () => {
  const r = await j('/api/inquiries', jsonReq('POST', {
    name: 'Public Person',
    email: 'inquiry@example.com',
    message: 'Hej',
  })); // no admin header
  assert.strictEqual(r.status, 201);
  assert.ok(typeof r.body.id === 'number');
  assert.strictEqual(r.body.ok, true);
});

/* ---- 6. Unknown /api route ---- */
test('unknown /api route returns 404 JSON', async () => {
  const r = await j('/api/nope');
  assert.strictEqual(r.status, 404);
  assert.ok(r.contentType.includes('application/json'));
  assert.deepStrictEqual(r.body, { error: 'Not found' });
});

/* ---- admin login (username/password → bearer token) ---- */
test('POST /api/admin/login: correct creds return a token that works', async () => {
  const r = await j('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'abe12345' }),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.token, 'test-token');
  // the returned token actually authorizes a gated endpoint
  const g = await j('/api/bookings', { headers: { Authorization: 'Bearer ' + r.body.token } });
  assert.strictEqual(g.status, 200);
});

test('POST /api/admin/login: wrong password -> 401, no token', async () => {
  const r = await j('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  assert.strictEqual(r.status, 401);
  assert.ok(!r.body.token);
});

test('POST /api/admin/login: wrong username -> 401', async () => {
  const r = await j('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'root', password: 'abe12345' }),
  });
  assert.strictEqual(r.status, 401);
});
