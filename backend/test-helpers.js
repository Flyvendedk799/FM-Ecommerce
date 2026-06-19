/* ============================================================
   Shared test helpers. Each test FILE sets these env vars and
   requires ../app itself (node --test isolates files in separate
   processes, so each gets a fresh :memory: DB).
   ============================================================ */
'use strict';

const TOKEN = 'test-token';
const ADMIN = { Authorization: `Bearer ${TOKEN}` };

// Boot the app on an ephemeral port; return { server, base }.
function boot(app) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

// fetch wrapper: returns { status, body, contentType, redirected }.
// Tries JSON first, falls back to raw text so we can assert on non-JSON too.
function makeClient(getBase) {
  return async function j(path, opts = {}) {
    const res = await fetch(getBase() + path, { redirect: 'manual', ...opts });
    const contentType = res.headers.get('content-type') || '';
    let body = null;
    const text = await res.text();
    if (contentType.includes('application/json')) {
      try { body = JSON.parse(text); } catch { body = null; }
    } else {
      body = text;
    }
    return { status: res.status, body, contentType, text, headers: res.headers };
  };
}

// Convenience: build request init for a JSON write.
function jsonReq(method, payload, withAdmin = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (withAdmin) Object.assign(headers, ADMIN);
  return { method, headers, body: JSON.stringify(payload) };
}

async function seedTestCatalog(j) {
  const cats = await j('/api/categories');
  const itCat = Array.isArray(cats.body) ? cats.body.find(c => c.key === 'it') : null;
  const supplier = await j('/api/suppliers', jsonReq('POST', {
    name: 'Test Supplier',
    abbr: 'TS',
    status: 'active',
  }, true));
  const course = await j('/api/courses', jsonReq('POST', {
    title: 'Excel Fixture Course',
    supplier_id: supplier.body.id,
    category_id: itCat ? itCat.id : null,
    price: 6900,
    format: 'Fysisk',
    duration: '1 dag',
    short_description: 'Fixture course for automated tests',
    status: 'active',
  }, true));
  const session = await j('/api/sessions', jsonReq('POST', {
    course_id: course.body.id,
    date: '2030-01-15',
    location: 'København',
    venue: 'Fixture venue',
    seats: 12,
  }, true));
  const booking = await j('/api/bookings', jsonReq('POST', {
    session_id: session.body.id,
    customer_name: 'Fixture Booker',
    customer_email: 'fixture@example.com',
    participants: 1,
  }));
  return {
    supplierId: supplier.body.id,
    courseId: course.body.id,
    sessionId: session.body.id,
    bookingId: booking.body.id,
  };
}

module.exports = { TOKEN, ADMIN, boot, makeClient, jsonReq, seedTestCatalog };
