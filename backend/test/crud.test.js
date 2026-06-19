/* ============================================================
   CRUD lifecycle, course filters, session enrichment,
   slugify (Danish chars), and the stats endpoint.
   Covers prompt cases 13, 14, 15, 17, 18.
   ============================================================ */
'use strict';
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_TOKEN = 'test-token';

const test = require('node:test');
const assert = require('node:assert');
const app = require('../app');
const { ADMIN, boot, makeClient, jsonReq, seedTestCatalog } = require('../test-helpers');

let server, base;
const j = makeClient(() => base);

test.before(async () => { ({ server, base } = boot(app)); await seedTestCatalog(j); });
test.after(() => server.close());

/* ---- 13. Course CRUD lifecycle ---- */
test('course CRUD: create, read, partial update, delete, re-delete 404', async () => {
  const title = 'Lifecycle Course ' + Date.now();
  const created = await j('/api/courses', jsonReq('POST',
    { title, price: 1234, short_description: 'orig short', badge: 'Populær' }, true));
  assert.strictEqual(created.status, 201);
  const id = created.body.id;
  assert.ok(typeof id === 'number');

  // Public GET returns it with the title.
  const got = await j('/api/courses/' + id);
  assert.strictEqual(got.status, 200);
  assert.strictEqual(got.body.title, title);
  assert.strictEqual(got.body.price, 1234);
  assert.strictEqual(got.body.short_description, 'orig short');

  // Partial update changes only provided fields.
  const upd = await j('/api/courses/' + id, jsonReq('PUT', { short_description: 'new short' }, true));
  assert.strictEqual(upd.status, 200);
  const after = await j('/api/courses/' + id);
  assert.strictEqual(after.body.short_description, 'new short', 'updated field changed');
  assert.strictEqual(after.body.title, title, 'untouched field unchanged');
  assert.strictEqual(after.body.price, 1234, 'untouched price unchanged');
  assert.strictEqual(after.body.badge, 'Populær', 'untouched badge unchanged');

  // PUT unknown id -> 404.
  const updMissing = await j('/api/courses/999999', jsonReq('PUT', { title: 'X' }, true));
  assert.strictEqual(updMissing.status, 404);

  // DELETE -> {ok:true}; second DELETE -> 404.
  const del1 = await j('/api/courses/' + id, { method: 'DELETE', headers: ADMIN });
  assert.strictEqual(del1.status, 200);
  assert.deepStrictEqual(del1.body, { ok: true });
  const del2 = await j('/api/courses/' + id, { method: 'DELETE', headers: ADMIN });
  assert.strictEqual(del2.status, 404);
  assert.deepStrictEqual(del2.body, { error: 'Not found' });
});

test('course JSON-array fields persist as arrays', async () => {
  const created = await j('/api/courses', jsonReq('POST', {
    title: 'Arrays ' + Date.now(),
    outcomes: ['a', 'b'],
    included: ['x'],
  }, true));
  const id = created.body.id;
  const got = await j('/api/courses/' + id);
  assert.ok(Array.isArray(got.body.outcomes), 'outcomes parsed as array');
  assert.deepStrictEqual(got.body.outcomes, ['a', 'b']);
  assert.deepStrictEqual(got.body.included, ['x']);
});

/* ---- 14. Course filters ---- */
test('course filters: category, status, q', async () => {
  // ?category=it -> all rows are in the IT category.
  const it = await j('/api/courses?category=it');
  assert.strictEqual(it.status, 200);
  assert.ok(it.body.length > 0, 'IT category has courses');
  assert.ok(it.body.every(c => c.category_key === 'it'), 'all rows are IT');

  // ?status=active -> excludes drafts. Create a draft to prove exclusion.
  const draft = await j('/api/courses', jsonReq('POST',
    { title: 'Hidden Draft ' + Date.now(), status: 'draft' }, true));
  const draftId = draft.body.id;

  const active = await j('/api/courses?status=active');
  assert.ok(active.body.every(c => c.status === 'active'), 'only active rows');
  assert.ok(!active.body.some(c => c.id === draftId), 'draft excluded from active filter');

  const drafts = await j('/api/courses?status=draft');
  assert.ok(drafts.body.some(c => c.id === draftId), 'draft visible under draft filter');

  // ?q=excel -> matches the per-file fixture course (case-insensitive).
  const q = await j('/api/courses?q=excel');
  assert.strictEqual(q.status, 200);
  assert.ok(q.body.length > 0, 'q=excel returns matches');
  assert.ok(
    q.body.every(c =>
      /excel/i.test(c.title || '') ||
      /excel/i.test(c.short_description || '') ||
      /excel/i.test(c.description || '') ||
      /excel/i.test(c.supplier_name || '') ||
      /excel/i.test(c.category_label || '')
    ),
    'every q result actually matches "excel" in a searched field'
  );

  // cleanup
  await j('/api/courses/' + draftId, { method: 'DELETE', headers: ADMIN });
});

test('course list includes upcoming availability metadata', async () => {
  const r = await j('/api/courses?status=active');
  assert.strictEqual(r.status, 200);
  const withDates = r.body.find(c => c.upcoming_session_count > 0);
  assert.ok(withDates, 'fixture active courses expose upcoming sessions');
  assert.match(withDates.next_session_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(typeof withDates.upcoming_session_count, 'number');
  assert.strictEqual(typeof withDates.next_session_seats_remaining, 'number');
  assert.strictEqual(typeof withDates.min_seats_remaining, 'number');
});

/* ---- 15. Sessions enrichment + course_id filter ---- */
test('GET /api/sessions?course_id=1 enriched with day/month/year + numeric seats_remaining', async () => {
  const r = await j('/api/sessions?course_id=1');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.length > 0, 'course 1 has sessions');
  for (const s of r.body) {
    assert.strictEqual(s.course_id, 1, 'filtered to course 1');
    assert.strictEqual(typeof s.seats_remaining, 'number', 'seats_remaining numeric');
    // Enriched date parts present (non-null because seed dates are valid ISO).
    assert.ok(s.day !== undefined, 'has day');
    assert.ok(s.month !== undefined, 'has month');
    assert.ok(s.year !== undefined, 'has year');
    assert.match(String(s.day), /^\d{2}$/, 'day is zero-padded two digits');
    assert.ok(typeof s.year === 'number', 'year is a number');
  }
});

/* ---- 17. slugify Danish chars ---- */
test('slugify maps Danish chars (å->aa) on POST course', async () => {
  const created = await j('/api/courses', jsonReq('POST', { title: 'Konflikthåndtering' }, true));
  assert.strictEqual(created.status, 201);
  const id = created.body.id;

  const got = await j('/api/courses/' + id);
  assert.strictEqual(got.status, 200);
  assert.strictEqual(got.body.slug, 'konflikthaandtering',
    'å must map to "aa" in the stored slug');

  await j('/api/courses/' + id, { method: 'DELETE', headers: ADMIN });
});

test('slugify maps æ and ø as well', async () => {
  const created = await j('/api/courses', jsonReq('POST', { title: 'Sælg Øvelse ' + Date.now() }, true));
  const id = created.body.id;
  const got = await j('/api/courses/' + id);
  assert.match(got.body.slug, /^saelg-oevelse-/, 'æ->ae and ø->oe');
  await j('/api/courses/' + id, { method: 'DELETE', headers: ADMIN });
});

/* ---- 18. Stats single-hop with expected keys ---- */
test('GET /api/stats is 200 JSON in one hop with expected count keys', async () => {
  const res = await fetch(base + '/api/stats', { headers: ADMIN, redirect: 'manual' });
  assert.strictEqual(res.status, 200, 'no 3xx redirect, direct 200');
  assert.ok((res.headers.get('content-type') || '').includes('application/json'));
  const body = await res.json();

  for (const key of [
    'total_courses', 'draft_courses', 'total_suppliers', 'total_sessions',
    'pending_bookings', 'confirmed_bookings', 'total_bookings',
    'new_inquiries', 'total_inquiries', 'recent_courses', 'recent_bookings',
  ]) {
    assert.ok(key in body, `stats missing key: ${key}`);
  }
  assert.strictEqual(typeof body.total_courses, 'number');
  assert.strictEqual(typeof body.new_inquiries, 'number');
  assert.ok(Array.isArray(body.recent_courses));
  assert.ok(Array.isArray(body.recent_bookings));
});

test('GET /api/bookings/stats/summary matches the stats shape (admin)', async () => {
  const r = await j('/api/bookings/stats/summary', { headers: ADMIN });
  assert.strictEqual(r.status, 200);
  assert.ok('total_courses' in r.body);
  assert.ok('total_bookings' in r.body);
});
