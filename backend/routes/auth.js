/* ============================================================
   Admin login — exchanges username/password for the API bearer token.
   Public + rate-limited (see app.js). The token then gates every
   admin API call via middleware/requireAdmin.
   ============================================================ */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_TOKEN } = require('../config');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

router.post('/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};
  // compute both before AND-ing so we don't leak which field was wrong
  const okUser = safeEqual(username, ADMIN_USERNAME);
  const okPass = safeEqual(password, ADMIN_PASSWORD);
  if (okUser && okPass) return res.json({ token: ADMIN_TOKEN });
  return res.status(401).json({ error: 'Forkert brugernavn eller adgangskode' });
});

module.exports = router;
