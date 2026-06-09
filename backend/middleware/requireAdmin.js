/* ============================================================
   Admin auth gate — timing-safe Bearer-token check.
   Protects all mutating endpoints and customer-PII reads.
   ============================================================ */
const crypto = require('crypto');
const { ADMIN_TOKEN } = require('../config');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

module.exports = function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token && safeEqual(token, ADMIN_TOKEN)) return next();
  return res.status(401).json({ error: 'Unauthorized — admin token required' });
};
