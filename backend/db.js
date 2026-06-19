/* ============================================================
   FUTUREMATCH — data-access layer (dual driver).
   • Postgres (pg) when DATABASE_URL is set (managed prod DB).
   • better-sqlite3 otherwise (zero-config dev fallback).
   Public surface is async: all/get/run/transaction (+ ready/close).
   SQL is written with `?` placeholders everywhere; the pg driver
   rewrites them to $1..$n internally.
   ============================================================ */
const path = require('path');
const fs = require('fs');

/* ============ SQLITE FILE RESOLUTION (fallback driver) ============
   Precedence: DB_PATH (tests use ':memory:') → DATA_DIR/futurematch.db
   (persistent, redeploy-safe dir injected by the host) → legacy
   in-repo location. */
const LEGACY_SQLITE_PATH = path.join(__dirname, 'futurematch.db');

function resolveSqlitePath(env = process.env) {
  if (env.DB_PATH) return env.DB_PATH;
  if (env.DATA_DIR) return path.join(env.DATA_DIR, 'futurematch.db');
  return LEGACY_SQLITE_PATH;
}

/* One-time seed migration: on first boot with an empty DATA_DIR, carry the
   legacy in-repo DB file over so existing data survives the move. */
function maybeSeedFromLegacy(targetPath, legacyPath = LEGACY_SQLITE_PATH) {
  if (targetPath === ':memory:' || targetPath === legacyPath) return false;
  if (fs.existsSync(targetPath) || !fs.existsSync(legacyPath)) return false;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(legacyPath, targetPath);
  return true;
}

/* ============ DRIVERS ============
   Each driver exposes the same async shape:
   exec(sql) / all(sql, ...params) / get(...) / run(...) /
   transaction(fn → called with a same-shaped executor) / close(). */

function sqliteDriver() {
  const Database = require('better-sqlite3');
  const dbPath = resolveSqlitePath();
  maybeSeedFromLegacy(dbPath);
  const sq = new Database(dbPath);

  // WAL only applies to file-backed DBs; ':memory:' ignores it harmlessly.
  sq.pragma('journal_mode = WAL');
  sq.pragma('foreign_keys = ON');

  const driver = {
    name: 'sqlite',
    async exec(sql) { sq.exec(sql); },
    async all(sql, ...params) { return sq.prepare(sql).all(...params); },
    async get(sql, ...params) { return sq.prepare(sql).get(...params); },
    async run(sql, ...params) {
      const r = sq.prepare(sql).run(...params);
      return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
    },
    // better-sqlite3 is synchronous underneath, so as long as the callback
    // only awaits this layer's helpers the whole transaction runs within one
    // event-loop turn and cannot interleave with other requests.
    async transaction(fn) {
      sq.exec('BEGIN IMMEDIATE');
      try {
        const out = await fn(driver);
        sq.exec('COMMIT');
        return out;
      } catch (e) {
        sq.exec('ROLLBACK');
        throw e;
      }
    },
    async close() { sq.close(); },
  };
  return driver;
}

function pgDriver() {
  const { Pool, types } = require('pg');

  // sqlite returns COUNT()/SUM() as numbers; node-pg returns int8/numeric as
  // strings by default. Parse them so both drivers emit the same JSON.
  types.setTypeParser(20, v => parseInt(v, 10));    // int8 (COUNT, SUM of int)
  types.setTypeParser(1700, v => parseFloat(v));    // numeric

  const url = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString: url,
    // Managed providers commonly require TLS with a provider-signed cert.
    ssl: /\bsslmode=require\b/.test(url) ? { rejectUnauthorized: false } : undefined,
  });

  // Rewrite `?` placeholders to $1..$n (no SQL in this app contains a literal '?').
  const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };
  const isInsert = (sql) => /^\s*insert\b/i.test(sql);

  function makeExec(q) { // q = pool or a checked-out client
    const ex = {
      name: 'pg',
      async exec(sql) { await q.query(sql); },
      async all(sql, ...params) { return (await q.query(toPg(sql), params)).rows; },
      async get(sql, ...params) { return (await q.query(toPg(sql), params)).rows[0]; },
      async run(sql, ...params) {
        // Every table has an `id` PK; RETURNING id mirrors lastInsertRowid.
        const text = isInsert(sql) && !/\breturning\b/i.test(sql) ? sql + ' RETURNING id' : sql;
        const r = await q.query(toPg(text), params);
        return {
          lastInsertRowid: isInsert(sql) && r.rows[0] ? r.rows[0].id : undefined,
          changes: r.rowCount,
        };
      },
    };
    return ex;
  }

  return {
    ...makeExec(pool),
    // SERIALIZABLE preserves the sqlite no-overbooking guarantee under
    // concurrent writes; a 40001 serialization failure maps to 409 in app.js.
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const out = await fn(makeExec(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
}

/* ============ SCHEMA (idempotent, per-dialect) ============ */
function schemaSql(isPg) {
  const ID = isPg
    ? 'INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY'
    : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  // Both drivers store TEXT timestamps in sqlite's 'YYYY-MM-DD HH:MM:SS' (UTC)
  // format so ORDER BY created_at stays portable.
  const NOW = isPg
    ? "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"
    : "(datetime('now'))";

  return `
  CREATE TABLE IF NOT EXISTS suppliers (
    id ${ID},
    name TEXT NOT NULL,
    abbr TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    website TEXT DEFAULT '',
    description TEXT DEFAULT '',
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS categories (
    id ${ID},
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    accent TEXT DEFAULT '#FF5A1F',
    bg TEXT DEFAULT '#2C1A0A',
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS courses (
    id ${ID},
    title TEXT NOT NULL,
    slug TEXT,
    source TEXT DEFAULT 'manual',
    source_handle TEXT DEFAULT '',
    product_type TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    published INTEGER DEFAULT 1,
    body_html TEXT DEFAULT '',
    image_src TEXT DEFAULT '',
    image_alt_text TEXT DEFAULT '',
    seo_title TEXT DEFAULT '',
    seo_description TEXT DEFAULT '',
    shopify_product_data TEXT DEFAULT '{}',
    last_imported_at TEXT DEFAULT '',
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    price INTEGER DEFAULT 0,
    price_label TEXT DEFAULT 'Pris ekskl. moms',
    price_note TEXT DEFAULT '',
    format TEXT DEFAULT 'Fysisk',
    duration TEXT DEFAULT '1 dag',
    is_online INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    short_description TEXT DEFAULT '',
    outcomes TEXT DEFAULT '[]',
    curriculum TEXT DEFAULT '[]',
    included TEXT DEFAULT '[]',
    facts TEXT DEFAULT '[]',
    marquee_items TEXT DEFAULT '[]',
    materials TEXT DEFAULT '[]',
    bring_items TEXT DEFAULT '[]',
    preset_type TEXT DEFAULT 'ledelse',
    badge TEXT DEFAULT '',
    color TEXT DEFAULT '#2C1A0A',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id ${ID},
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    end_date TEXT DEFAULT '',
    date_text TEXT DEFAULT '',
    location TEXT NOT NULL,
    venue TEXT DEFAULT '',
    format TEXT DEFAULT 'Fysisk · 1 dag',
    is_online INTEGER DEFAULT 0,
    seats INTEGER DEFAULT 14,
    is_popular INTEGER DEFAULT 0,
    source_variant_sku TEXT DEFAULT '',
    option1_name TEXT DEFAULT '',
    option1_value TEXT DEFAULT '',
    option2_name TEXT DEFAULT '',
    option2_value TEXT DEFAULT '',
    option3_name TEXT DEFAULT '',
    option3_value TEXT DEFAULT '',
    variant_price INTEGER,
    variant_compare_at_price INTEGER,
    variant_inventory_tracker TEXT DEFAULT '',
    variant_inventory_qty INTEGER,
    variant_inventory_policy TEXT DEFAULT '',
    variant_fulfillment_service TEXT DEFAULT '',
    variant_requires_shipping INTEGER DEFAULT 0,
    variant_taxable INTEGER DEFAULT 0,
    variant_barcode TEXT DEFAULT '',
    variant_image TEXT DEFAULT '',
    variant_grams INTEGER,
    variant_weight_unit TEXT DEFAULT '',
    variant_tax_code TEXT DEFAULT '',
    cost_per_item INTEGER,
    shopify_variant_data TEXT DEFAULT '{}',
    last_imported_at TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS orders (
    id ${ID},
    reference TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_company TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    billing_address TEXT DEFAULT '',
    billing_zip TEXT DEFAULT '',
    billing_city TEXT DEFAULT '',
    billing_country TEXT DEFAULT 'Danmark',
    ean TEXT DEFAULT '',
    vat_number TEXT DEFAULT '',
    payment_method TEXT DEFAULT 'faktura',
    subtotal_ex_vat INTEGER DEFAULT 0,
    discount_total INTEGER DEFAULT 0,
    total_ex_vat INTEGER DEFAULT 0,
    vat_total INTEGER DEFAULT 0,
    total_inc_vat INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'DKK',
    status TEXT DEFAULT 'pending',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id ${ID},
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_company TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    participants INTEGER DEFAULT 1,
    payment_method TEXT DEFAULT 'faktura',
    unit_price INTEGER DEFAULT 0,
    discount INTEGER DEFAULT 0,
    line_total INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id ${ID},
    type TEXT DEFAULT 'contact',          -- contact | firmahold | notify | udbyder
    name TEXT DEFAULT '',
    email TEXT NOT NULL,
    phone TEXT DEFAULT '',
    company TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    message TEXT DEFAULT '',
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    course_title TEXT DEFAULT '',
    participants INTEGER,
    status TEXT DEFAULT 'new',            -- new | handled
    created_at TEXT DEFAULT ${NOW}
  );

  /* ---- indexes on foreign keys / hot filters ---- */
  CREATE INDEX IF NOT EXISTS idx_courses_supplier  ON courses(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_courses_category  ON courses(category_id);
  CREATE INDEX IF NOT EXISTS idx_courses_status    ON courses(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_course   ON sessions(course_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_reference  ON orders(reference);
  CREATE INDEX IF NOT EXISTS idx_bookings_session  ON bookings(session_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_inquiries_course  ON inquiries(course_id);
  CREATE INDEX IF NOT EXISTS idx_inquiries_status  ON inquiries(status);
  `;
}

function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name))) {
    throw new Error('Invalid SQL identifier');
  }
  return `"${name}"`;
}

async function hasColumn(x, table, column) {
  if (x.name === 'pg') {
    return !!(await x.get(`
      SELECT 1 AS ok
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ?
        AND column_name = ?
    `, table, column));
  }
  const cols = await x.all(`PRAGMA table_info(${quoteIdent(table)})`);
  return cols.some(c => c.name === column);
}

async function ensureColumn(x, table, column, sqliteDefinition, pgDefinition = sqliteDefinition) {
  if (await hasColumn(x, table, column)) return;
  const definition = x.name === 'pg' ? pgDefinition : sqliteDefinition;
  await x.exec(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(column)} ${definition}`);
}

async function migrate(x) {
  await ensureColumn(x, 'bookings', 'order_id', 'INTEGER');
  await ensureColumn(x, 'bookings', 'unit_price', 'INTEGER DEFAULT 0');
  await ensureColumn(x, 'bookings', 'discount', 'INTEGER DEFAULT 0');
  await ensureColumn(x, 'bookings', 'line_total', 'INTEGER DEFAULT 0');

  const courseTextCols = [
    'source', 'source_handle', 'product_type', 'tags', 'body_html', 'image_src',
    'image_alt_text', 'seo_title', 'seo_description', 'shopify_product_data',
    'last_imported_at',
  ];
  for (const col of courseTextCols) {
    const def = col === 'source' ? "TEXT DEFAULT 'manual'" : col === 'shopify_product_data' ? "TEXT DEFAULT '{}'" : "TEXT DEFAULT ''";
    await ensureColumn(x, 'courses', col, def);
  }
  await ensureColumn(x, 'courses', 'published', 'INTEGER DEFAULT 1');

  const sessionTextCols = [
    'end_date', 'date_text', 'source_variant_sku', 'option1_name', 'option1_value',
    'option2_name', 'option2_value', 'option3_name', 'option3_value',
    'variant_inventory_tracker', 'variant_inventory_policy',
    'variant_fulfillment_service', 'variant_barcode', 'variant_image',
    'variant_weight_unit', 'variant_tax_code', 'shopify_variant_data',
    'last_imported_at',
  ];
  for (const col of sessionTextCols) {
    const def = col === 'shopify_variant_data' ? "TEXT DEFAULT '{}'" : "TEXT DEFAULT ''";
    await ensureColumn(x, 'sessions', col, def);
  }
  for (const col of [
    'variant_price', 'variant_compare_at_price', 'variant_inventory_qty',
    'variant_requires_shipping', 'variant_taxable', 'variant_grams', 'cost_per_item',
  ]) {
    await ensureColumn(x, 'sessions', col, 'INTEGER');
  }

  await x.exec('CREATE INDEX IF NOT EXISTS idx_bookings_order ON bookings(order_id)');
  await x.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_source_handle
    ON courses(source_handle) WHERE source_handle IS NOT NULL AND source_handle != ''
  `);
  await x.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_source_variant_sku
    ON sessions(source_variant_sku) WHERE source_variant_sku IS NOT NULL AND source_variant_sku != ''
  `);
}

/* ============ SEED DATA ============ */
async function seed(x) {
  const catCount = (await x.get('SELECT COUNT(*) as n FROM categories')).n;
  if (catCount > 0) return;

  const insertCatSql = `
    INSERT INTO categories (key, label, accent, bg, description, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const cats = [
    ['ledelse', 'Ledelse & Kommunikation', '#FF5A1F', '#2C1A0A', 'Bliv en stærkere leder, kommunikator og forhandler. Kurser for alle niveauer.', 1],
    ['it',      'IT & Data',               '#3A6FF8', '#0D1A38', 'Excel, Power BI, Python og alt det digitale. Fra begynder til ekspert.', 2],
    ['cert',    'Certificering',            '#6B4DE0', '#1E0E3C', 'PRINCE2, ITIL og andre internationalt anerkendte certifikater.', 3],
    ['sundhed', 'Sundhed & Omsorg',         '#2F8F63', '#0E2A1C', 'Førstehjælp, HLR og kurser til sundheds- og omsorgssektoren.', 4],
    ['amu',     'AMU / Erhvervsfaglig',     '#C7553A', '#2E1208', 'Statsfinansierede AMU-kurser — gratis for berettigede deltagere.', 5],
    ['salg',    'Salg & Kundeservice',      '#C9A227', '#2E1A0A', 'Sælg bedre, betjen kunder professionelt og byg stærke relationer.', 6],
  ];
  for (const c of cats) await x.run(insertCatSql, ...c);

  // Product data is supplier-owned now. Keep only the category scaffold in a
  // fresh database; courses and sessions are created through CSV import.
}

/* ============ PUBLIC LAYER ============ */
const driver = process.env.DATABASE_URL ? pgDriver() : sqliteDriver();

const ready = (async () => {
  await driver.exec(schemaSql(driver.name === 'pg'));
  await migrate(driver);
  await seed(driver);
})();
// Failures surface via the gated helpers and the server-boot await; this
// branch handler just prevents an unhandled-rejection crash in between.
ready.catch(() => {});

module.exports = {
  driver: driver.name,
  ready,
  all: async (sql, ...params) => { await ready; return driver.all(sql, ...params); },
  get: async (sql, ...params) => { await ready; return driver.get(sql, ...params); },
  run: async (sql, ...params) => { await ready; return driver.run(sql, ...params); },
  transaction: async (fn) => { await ready; return driver.transaction(fn); },
  close: () => driver.close(),
  // exposed for the db-layer tests
  _internal: { resolveSqlitePath, maybeSeedFromLegacy, LEGACY_SQLITE_PATH },
};
