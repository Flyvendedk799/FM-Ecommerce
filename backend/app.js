/* ============================================================
   FUTUREMATCH — Express app (no listen; see server.js).
   Exported separately so tests can drive it on an ephemeral port
   against an isolated DB.
   ============================================================ */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config');
const db = require('./db');
const requireAdmin = require('./middleware/requireAdmin');
const wrapAsync = require('./middleware/wrapAsync');
const { getStats } = require('./stats');

const app = express();

/* ---- security & transport ---- */
// CSP is disabled here because the admin SPA and a redirect stub use inline
// handlers; the remaining helmet defaults (nosniff, frameguard, referrer-policy,
// HSTS, no X-Powered-By) still harden the app. XSS is covered by output-escaping.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

// Frontend + admin are served same-origin from this app, so cross-origin is off
// by default. Set ALLOWED_ORIGINS (comma-separated) to opt specific origins in.
if (config.ALLOWED_ORIGINS.length) {
  app.use(cors({ origin: config.ALLOWED_ORIGINS }));
}

app.use(express.json({ limit: '64kb' }));

/* ---- request logging (quiet during tests) ---- */
if (!config.isTest) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });
}

/* ---- rate limiting (skipped in tests) ---- */
if (!config.isTest) {
  app.use('/api', rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
  // Stricter cap on the unauthenticated public submission endpoints.
  const publicWrite = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: 'For mange forsøg — prøv igen om lidt.' } });
  const onlyPost = (req, res, next) => (req.method === 'POST' ? publicWrite(req, res, next) : next());
  app.use('/api/bookings', onlyPost);
  app.use('/api/inquiries', onlyPost);
  // brute-force guard on admin login
  app.use('/api/admin/login', rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: 'For mange loginforsøg — prøv igen om lidt.' } }));
}

/* ---- API routes ---- */
app.use('/api/admin',      require('./routes/auth'));   // public login (POST /api/admin/login)
app.use('/api/suppliers',  require('./routes/suppliers'));
app.use('/api/courses',    require('./routes/courses'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/sessions',   require('./routes/sessions'));
app.use('/api/bookings',   require('./routes/bookings'));
app.use('/api/inquiries',  require('./routes/inquiries'));
// Direct stats (admin-only) — single hop, no redirect.
app.get('/api/stats', requireAdmin, wrapAsync(async (req, res) => res.json(await getStats())));

// JSON 404 for unknown API routes (must precede the static fallback).
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ---- Favicon (brand mark, inline so every page gets it) ---- */
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#17150E"/>
  <rect x="8" y="8" width="9" height="9" rx="2" fill="#FF5A1F"/>
  <rect x="15" y="15" width="9" height="9" rx="2" fill="#F3EEE2"/>
</svg>`;
app.get(['/favicon.ico', '/favicon.svg'], (req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(FAVICON);
});

/* ---- robots + sitemap ---- */
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api\nSitemap: /sitemap.xml\n');
});
app.get('/sitemap.xml', wrapAsync(async (req, res) => {
  let courses = [];
  try {
    courses = await db.all("SELECT id FROM courses WHERE status='active'");
  } catch (_) { /* ignore */ }
  const base = `${req.protocol}://${req.get('host')}`;
  const staticPages = ['/Landing.html', '/Kategorier.html', '/Kontakt.html', '/Firmahold.html',
    '/FAQ.html', '/Handelsbetingelser.html', '/Privatlivspolitik.html'];
  const urls = ['/'].concat(staticPages).concat(courses.map(c => `/kursus.html?id=${c.id}`));
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${base}${u}</loc></url>`).join('\n') +
    `\n</urlset>\n`;
  res.type('application/xml').send(body);
}));

/* ---- Admin UI ---- */
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../admin/index.html')));

/* ---- Frontend ---- */
// Serve the image-slot state explicitly: express.static ignores dotfiles, but
// this holds the real photos dropped in during design (e.g. the course hero).
app.get('/.image-slots.state.json', (req, res) =>
  res.sendFile(path.join(__dirname, '../project/.image-slots.state.json'), { dotfiles: 'allow' }));
app.use('/', express.static(path.join(__dirname, '../project')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../project/Landing.html')));

/* ---- global error handler (LAST) — always JSON, never leak stack ---- */
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  // Constraint violations: SQLITE_CONSTRAINT_* (sqlite), class 23 (pg) and
  // 22P02 invalid-text-representation (pg, e.g. a non-numeric id).
  if (err && typeof err.code === 'string' &&
      (err.code.startsWith('SQLITE_CONSTRAINT') || /^23\d{3}$/.test(err.code) || err.code === '22P02')) {
    return res.status(400).json({ error: 'Invalid reference or constraint violation' });
  }
  // pg serialization failure (SERIALIZABLE write conflict) — retryable.
  if (err && err.code === '40001') {
    return res.status(409).json({ error: 'Samtidig opdatering — prøv igen' });
  }
  if (err && err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.expose ? err.message : 'Bad request' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
