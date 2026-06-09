/* ============================================================
   The data-access layer itself: driver selection (DATABASE_URL →
   pg, otherwise sqlite), DATA_DIR file placement, and the one-time
   legacy-file seed copy.
   ============================================================ */
'use strict';
process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-token';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Re-require db.js with a controlled env (it captures env at require time).
function freshDb(env) {
  for (const k of ['DATABASE_URL', 'DB_PATH', 'DATA_DIR']) delete process.env[k];
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../db')];
  return require('../db');
}

test('no DATABASE_URL -> sqlite driver, schema + seed work', async () => {
  const db = freshDb({ DB_PATH: ':memory:' });
  assert.strictEqual(db.driver, 'sqlite');
  await db.ready;
  const cats = await db.get('SELECT COUNT(*) AS n FROM categories');
  assert.strictEqual(cats.n, 6, 'seed ran');
  await db.close();
});

test('DATABASE_URL set -> pg driver attempted (init rejects without a server)', async () => {
  // Port 1 refuses immediately; proves pg was selected and a connection attempted.
  const db = freshDb({ DATABASE_URL: 'postgres://u:p@127.0.0.1:1/futurematch' });
  assert.strictEqual(db.driver, 'pg');
  await assert.rejects(db.ready, 'init must fail when Postgres is unreachable');
  await db.close();
});

test('DATA_DIR places the sqlite file at DATA_DIR/futurematch.db', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-datadir-'));
  const db = freshDb({ DATA_DIR: dataDir });
  assert.strictEqual(db.driver, 'sqlite');
  await db.ready;
  assert.ok(fs.existsSync(path.join(dataDir, 'futurematch.db')), 'db file created in DATA_DIR');
  await db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('sqlite path resolution precedence: DB_PATH > DATA_DIR > legacy', () => {
  const { resolveSqlitePath, LEGACY_SQLITE_PATH } = freshDb({ DB_PATH: ':memory:' })._internal;
  assert.strictEqual(resolveSqlitePath({ DB_PATH: '/x/y.db', DATA_DIR: '/data' }), '/x/y.db');
  assert.strictEqual(resolveSqlitePath({ DATA_DIR: '/data' }), path.join('/data', 'futurematch.db'));
  assert.strictEqual(resolveSqlitePath({}), LEGACY_SQLITE_PATH);
});

test('one-time seed copy: legacy file copied to empty DATA_DIR target, then never again', () => {
  const { maybeSeedFromLegacy } = freshDb({ DB_PATH: ':memory:' })._internal;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-seedcopy-'));
  const legacy = path.join(tmp, 'legacy.db');
  const target = path.join(tmp, 'data', 'futurematch.db');
  fs.writeFileSync(legacy, 'legacy-bytes');

  // First boot with an empty DATA_DIR: copies the legacy file across.
  assert.strictEqual(maybeSeedFromLegacy(target, legacy), true);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'legacy-bytes');

  // Target now exists: never copied again (no clobbering live data).
  fs.writeFileSync(target, 'live-data');
  assert.strictEqual(maybeSeedFromLegacy(target, legacy), false);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'live-data');

  // No-ops: ':memory:', target==legacy, missing legacy file.
  assert.strictEqual(maybeSeedFromLegacy(':memory:', legacy), false);
  assert.strictEqual(maybeSeedFromLegacy(legacy, legacy), false);
  assert.strictEqual(maybeSeedFromLegacy(path.join(tmp, 'other.db'), path.join(tmp, 'nope.db')), false);

  fs.rmSync(tmp, { recursive: true, force: true });
});
