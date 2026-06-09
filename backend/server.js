/* ============================================================
   FUTUREMATCH — server entrypoint.
   Boots the Express app (backend/app.js) and handles lifecycle.
   ============================================================ */
const app = require('./app');
const db = require('./db');
const config = require('./config');

const server = app.listen(config.PORT, () => {
  console.log(`\n  Futurematch server running  (${config.NODE_ENV})\n`);
  console.log(`  Frontend  →  http://localhost:${config.PORT}/`);
  console.log(`  Admin     →  http://localhost:${config.PORT}/admin`);
  console.log(`  API       →  http://localhost:${config.PORT}/api/`);
  if (config.USING_DEV_CREDS) {
    console.log(`\n  ⚠  Admin login (dev default) →  brugernavn: "${config.ADMIN_USERNAME}"  ·  adgangskode: "${config.ADMIN_PASSWORD}"`);
    console.log(`     Set ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_TOKEN in production.\n`);
  } else {
    console.log('');
  }
});

/* ---- graceful shutdown (checkpoints WAL, closes DB) ---- */
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down…`);
  server.close(() => {
    try { db.close(); } catch (_) { /* ignore */ }
    process.exit(0);
  });
  // hard-exit fallback if connections hang
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
