/* ============================================================
   Central configuration — environment-driven with sane dev defaults.
   ============================================================ */
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

// Admin API token. Required in production; a known dev token is used otherwise
// so the admin UI works out of the box locally (printed in the server banner).
const DEV_ADMIN_TOKEN = 'dev-admin-token';
let ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  if (isProd) {
    console.error('FATAL: ADMIN_TOKEN environment variable must be set in production.');
    process.exit(1);
  }
  ADMIN_TOKEN = DEV_ADMIN_TOKEN;
}

// Admin login credentials. Defaults work out of the box; override via env in prod.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEV_ADMIN_PASSWORD = 'abe12345';
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  if (isProd) {
    console.error('FATAL: ADMIN_PASSWORD environment variable must be set in production.');
    process.exit(1);
  }
  ADMIN_PASSWORD = DEV_ADMIN_PASSWORD;
}

module.exports = {
  NODE_ENV,
  isProd,
  isTest,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  // DB selection lives in db.js: DATABASE_URL → Postgres; otherwise sqlite at
  // DB_PATH (tests use ':memory:') or DATA_DIR/futurematch.db or the legacy file.
  ADMIN_TOKEN,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  USING_DEV_TOKEN: ADMIN_TOKEN === DEV_ADMIN_TOKEN && !isProd,
  USING_DEV_CREDS: ADMIN_PASSWORD === DEV_ADMIN_PASSWORD && !isProd,
  // Empty list = no cross-origin access (frontend + admin are served same-origin).
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
};
