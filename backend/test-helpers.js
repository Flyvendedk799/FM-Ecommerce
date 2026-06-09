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

module.exports = { TOKEN, ADMIN, boot, makeClient, jsonReq };
