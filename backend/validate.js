/* ============================================================
   Shared input-validation helpers.
   Validators throw an Error with `.status` so the global error
   handler (app.js) returns a clean JSON 400 — no per-route try/catch
   needed (async routes are wrapped via middleware/wrapAsync).
   ============================================================ */

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true; // safe to surface this message to the client
  return e;
}

const STATUS = {
  booking:  ['pending', 'confirmed', 'cancelled'],
  // Only 'active' sessions are shown/bookable on the shop; the rest are operator states.
  session:  ['active', 'full', 'cancelled', 'archived'],
  course:   ['active', 'draft', 'archived'],
  supplier: ['active', 'inactive'],
  inquiry:  ['new', 'handled'],
};

// POST: silently coerce an out-of-set / missing status to the default.
function statusOrDefault(value, kind, def) {
  if (value == null) return def;
  return STATUS[kind].includes(value) ? value : def;
}

// PUT: an explicitly-provided invalid status is a 400; undefined keeps current.
function statusStrict(value, kind, current) {
  if (value === undefined) return current;
  if (!STATUS[kind].includes(value)) {
    throw httpError(400, `Ugyldig status "${value}" (tilladt: ${STATUS[kind].join(', ')})`);
  }
  return value;
}

function intInRange(value, { min, max, field, def }) {
  if (value === undefined || value === null || value === '') {
    if (def !== undefined) return def;
    throw httpError(400, `${field} er påkrævet`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw httpError(400, `${field} skal være et tal`);
  const i = Math.trunc(n);
  if (i < min || i > max) throw httpError(400, `${field} skal være mellem ${min} og ${max}`);
  return i;
}

function numInRange(value, { min, max, field, def }) {
  if (value === undefined || value === null || value === '') {
    if (def !== undefined) return def;
    throw httpError(400, `${field} er påkrævet`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw httpError(400, `${field} skal være mellem ${min} og ${max}`);
  }
  return n;
}

// Stored JSON-array columns: only ever persist a real array, never a bare string.
function jsonArray(value) {
  return Array.isArray(value) ? JSON.stringify(value) : '[]';
}

/* ---- course gallery ----
   Accepts ['https://…'] or [{ src, alt, position }] and returns a clean
   [{ src, alt }] array: absolute http(s), protocol-relative and site-relative
   sources only (a javascript:/data: src would run or bloat in the shop),
   deduped on src, order preserved, capped so one bad import can't
   balloon a row. */
const MAX_IMAGES = 24;

function isSafeImageSrc(src) {
  if (!src || src.length > 1200) return false;
  if (/^\s*(javascript|data|vbscript):/i.test(src)) return false;
  return /^(https?:)?\/\//i.test(src) || /^\/[^/]/.test(src) || /^[\w.-]+\/[^\s]*$/.test(src);
}

function imageList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    const raw = typeof entry === 'string' ? { src: entry } : (entry && typeof entry === 'object' ? entry : null);
    if (!raw) continue;
    const src = String(raw.src == null ? '' : raw.src).trim();
    if (!isSafeImageSrc(src) || seen.has(src)) continue;
    seen.add(src);
    out.push({ src, alt: String(raw.alt == null ? '' : raw.alt).trim().slice(0, 260) });
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
}

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s));
}

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

module.exports = {
  httpError, STATUS, statusOrDefault, statusStrict,
  intInRange, numInRange, jsonArray, imageList, isSafeImageSrc,
  isEmail, isISODate, todayISO, MAX_IMAGES,
};
