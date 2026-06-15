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
    location TEXT NOT NULL,
    venue TEXT DEFAULT '',
    format TEXT DEFAULT 'Fysisk · 1 dag',
    is_online INTEGER DEFAULT 0,
    seats INTEGER DEFAULT 14,
    is_popular INTEGER DEFAULT 0,
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
  await x.exec('CREATE INDEX IF NOT EXISTS idx_bookings_order ON bookings(order_id)');
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

  const insertSupplierSql = `
    INSERT INTO suppliers (name, abbr, email, phone, website, description, rating, review_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const suppliers = [
    ['Competence Way',          'CW',  'kurser@cw.dk',             '77 300 123', 'https://competenceway.dk',          'Ledende udbyder af ledelse- og kommunikationskurser i Danmark.',    4.8, 312],
    ['Waltersdorff Consulting', 'WC',  'therese@waltersdorff.dk',  '70 270 270', 'https://waltersdorff.dk',           'Præsentationsteknik, motivation og personlig branding.',            4.9, 287],
    ['DataSkolen',              'DS',  'info@dataskolen.dk',        '88 200 200', 'https://dataskolen.dk',             'Specialister i IT og data-kurser for erhvervslivet.',               4.8, 668],
    ['CodeDanmark',             'CD',  'hej@codedanmark.dk',        '88 100 100', 'https://codedanmark.dk',            'Programmering og teknologi for professionelle.',                    4.6, 189],
    ['PM Academy',              'PM',  'info@pmacademy.dk',         '70 400 400', 'https://pmacademy.dk',              'PRINCE2, ITIL og internationale projektledelsescertifikater.',      4.9, 933],
    ['Dansk Røde Kors',         'DRK', 'kurser@rodekors.dk',        '33 250 250', 'https://rodekors.dk',               'Officielle førstehjælpskurser og sundhedsfaglige uddannelser.',    4.9, 1240],
    ['Mind Danmark',            'MD',  'info@minddanmark.dk',       '70 777 888', 'https://minddanmark.dk',            'Mental sundhed og psykisk trivsel på arbejdspladsen.',             4.7, 387],
    ['TechErhverv',             'TE',  'amu@techerhverv.dk',        '76 100 200', 'https://techerhverv.dk',            'AMU-kurser og erhvervsfaglige uddannelser for industrien.',         4.7, 359],
    ['ServiceAkademiet',        'SA',  'info@serviceakademiet.dk',  '70 888 999', 'https://serviceakademiet.dk',       'Kundeservice, salg og kommunikation for frontline medarbejdere.',  4.6, 278],
  ];
  for (const s of suppliers) await x.run(insertSupplierSql, ...s);

  const getCatId = async key => (await x.get('SELECT id FROM categories WHERE key=?', key)).id;
  const getSupId = async name => (await x.get('SELECT id FROM suppliers WHERE name=?', name)).id;

  const courses = [
    {
      title: 'Forhandlingsteknik',
      slug: 'forhandlingsteknik',
      supplier: 'Competence Way',
      cat: 'ledelse',
      price: 6900, format: 'Fysisk', dur: '1 dag', online: 1,
      rating: 4.8, reviews: 312, color: '#2C1A0A', badge: '', preset: 'ledelse',
      outcomes: JSON.stringify(['Lær at skabe win-win-forhandlingsresultater, hvor begge parter rejser sig tilfredse.','Udvid dit forhandlingsrum og bliv skarp til at identificere det gode kompromis.','Mestr selvindsigt, kontrol og effektiv kommunikation — også når følelserne stiger.']),
      included: JSON.stringify(['Kursusbevis','Forplejning hele dagen','Alle kursusmaterialer','Maks 14 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'1 dag',s:'/ 09–16'},{k:'Niveau',v:'Alle',s:'/ ingen forudsætninger'},{k:'Format',v:'Fysisk',s:'/ + online hold'},{k:'Deltagere',v:'Maks 14',s:'/ pr. hold'}]),
      marquee: JSON.stringify(['Win-win resultater','Selvindsigt','Det gode kompromis','Kontrol ved bordet','Effektiv kommunikation']),
    },
    {
      title: 'Præsentationsteknik', slug: 'praesentationsteknik',
      supplier: 'Waltersdorff Consulting', cat: 'ledelse',
      price: 6900, format: 'Fysisk', dur: '1 dag', online: 1,
      rating: 4.9, reviews: 287, color: '#1F3A2E', badge: '', preset: 'ledelse',
      outcomes: JSON.stringify(['Strukturér dine præsentationer, så budskabet lander præcist.','Tal med selvtillid foran en sal — og hold nerverne i skak.','Skab visuelt materiale der understøtter — ikke erstatter — din tale.']),
      included: JSON.stringify(['Kursusbevis','Forplejning','Materialer','Maks 14 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'1 dag',s:'/ 09–16'},{k:'Niveau',v:'Alle',s:''},{k:'Format',v:'Fysisk',s:'/ + online'},{k:'Deltagere',v:'Maks 14',s:''}]),
      marquee: JSON.stringify(['Selvtillidsfyldte præsentationer','Klar kommunikation','Slagkraftige slides','Nervekontrol']),
    },
    {
      title: 'Konflikthåndtering', slug: 'konflikthåndtering',
      supplier: 'Competence Way', cat: 'ledelse',
      price: 6500, format: 'Fysisk', dur: '1 dag', online: 0,
      rating: 4.7, reviews: 198, color: '#3A2C19', badge: '', preset: 'ledelse',
      outcomes: JSON.stringify(['Identificér konflikter tidligt og håndter dem konstruktivt.','Bliv en neutral mægler der bringer parterne tættere.','Byg et arbejdsmiljø, hvor uenigheder løses professionelt.']),
      included: JSON.stringify(['Kursusbevis','Forplejning','Materialer','Maks 14 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'1 dag',s:''},{k:'Niveau',v:'Alle',s:''},{k:'Format',v:'Fysisk',s:''},{k:'Deltagere',v:'Maks 14',s:''}]),
      marquee: JSON.stringify(['Konstruktiv dialog','Konfliktforståelse','Mægling','Psykologisk tryghed']),
    },
    {
      title: 'Personlig gennemslagskraft', slug: 'personlig-gennemslagskraft',
      supplier: 'Waltersdorff Consulting', cat: 'ledelse',
      price: 9900, format: 'Fysisk', dur: '2 dage', online: 1,
      rating: 4.8, reviews: 241, color: '#2A1F14', badge: '', preset: 'ledelse',
      outcomes: JSON.stringify(['Kommunikér med tyngde og naturlig autoritet.','Forstå din persontype og brug den strategisk.','Skab varig gennemslagskraft i møder, præsentationer og daglig kommunikation.']),
      included: JSON.stringify(['Kursusbevis','Forplejning begge dage','Materialer','Maks 14 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'2 dage',s:'/ 09–16'},{k:'Niveau',v:'Alle',s:''},{k:'Format',v:'Fysisk',s:'/ + online'},{k:'Deltagere',v:'Maks 14',s:''}]),
      marquee: JSON.stringify(['Naturlig autoritet','Persontype','Strategisk kommunikation','Selvtillid']),
    },
    {
      title: 'Excel — Avanceret', slug: 'excel-avanceret',
      supplier: 'DataSkolen', cat: 'it',
      price: 8900, format: 'Fysisk', dur: '2 dage', online: 1,
      rating: 4.8, reviews: 445, color: '#0D1A38', badge: '', preset: 'it',
      outcomes: JSON.stringify(['Behersk XOPSLAG, dynamiske arrays og avancerede formler.','Byg automatisk-opdaterende dashboards med pivottabeller.','Automatiser gentagne opgaver med Power Query og makroer.']),
      included: JSON.stringify(['Kursusbevis','Digitale øvelsesfiler','Online adgang i 12 mdr.','Maks 12 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'2 dage',s:'/ 09–16'},{k:'Niveau',v:'Øvet',s:'/ Excel-kendskab'},{k:'Format',v:'Fysisk',s:'/ + online'},{k:'Deltagere',v:'Maks 12',s:''}]),
      marquee: JSON.stringify(['Avancerede formler','Pivottabeller','Power Query','Dashboards']),
    },
    {
      title: 'Power BI Dashboard', slug: 'power-bi-dashboard',
      supplier: 'DataSkolen', cat: 'it',
      price: 5900, format: 'Online', dur: '1 dag', online: 1,
      rating: 4.7, reviews: 223, color: '#1F2E42', badge: '', preset: 'it',
      outcomes: JSON.stringify(['Opbyg interaktive dashboards i Power BI Desktop og Service.','Transformér rå data til indsigt med Power Query.','Del og publicér dine rapporter sikkert i din organisation.']),
      included: JSON.stringify(['Kursusbevis','Digitale materialer','Online adgang 6 mdr.','Maks 12 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'1 dag',s:'/ 09–16'},{k:'Niveau',v:'Begynder',s:''},{k:'Format',v:'Online',s:''},{k:'Deltagere',v:'Maks 12',s:''}]),
      marquee: JSON.stringify(['Interaktive dashboards','Data transformation','Power Query','Publicering']),
    },
    {
      title: 'Python for Professionals', slug: 'python-for-professionals',
      supplier: 'CodeDanmark', cat: 'it',
      price: 12900, format: 'Fysisk', dur: '3 dage', online: 1,
      rating: 4.6, reviews: 189, color: '#1A1F35', badge: '', preset: 'it',
      outcomes: JSON.stringify(['Skriv clean Python-kode til dataanalyse og automatisering.','Arbejd med pandas, NumPy og visualisering i matplotlib.','Byg og deploy simple scripts til produktionsmiljøer.']),
      included: JSON.stringify(['Kursusbevis','Digitale øvelsesfiler','GitHub-repo med løsninger','Maks 10 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'3 dage',s:'/ 09–16'},{k:'Niveau',v:'Begynder+',s:'/ Python-grundviden'},{k:'Format',v:'Fysisk',s:'/ + online'},{k:'Deltagere',v:'Maks 10',s:''}]),
      marquee: JSON.stringify(['Python','Pandas','Data automation','Scripting']),
    },
    {
      title: 'PRINCE2® Foundation', slug: 'prince2-foundation',
      supplier: 'PM Academy', cat: 'cert',
      price: 14900, format: 'Fysisk', dur: '3 dage + eksamen', online: 1,
      rating: 4.9, reviews: 521, color: '#1E0E3C', badge: 'cert', preset: 'cert',
      outcomes: JSON.stringify(['Forstå og anvend PRINCE2® principperne i virkelige projekter fra dag ét.','Bestå den officielle Foundation-eksamen — eksamensgebyr er inkluderet.','Tilføj PRINCE2® Foundation til dit CV med et digitalt verifikationslink.']),
      included: JSON.stringify(['PRINCE2® eksamen inkluderet','Officielt studiemateriale','Digitalt certifikat','Maks 12 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'3 dage',s:'+ eksamen dag 4'},{k:'Beståelsespct.',v:'92%',s:'/ på dette hold'},{k:'Bevis',v:'PRINCE2®',s:'/ internationalt'},{k:'Deltagere',v:'Maks 12',s:''}]),
      marquee: JSON.stringify(['Internationalt anerkendt','Projektledelse','PRINCE2®','Eksamen inkluderet']),
    },
    {
      title: 'ITIL® 4 Foundation', slug: 'itil-4-foundation',
      supplier: 'PM Academy', cat: 'cert',
      price: 11900, format: 'Fysisk', dur: '2 dage + eksamen', online: 1,
      rating: 4.8, reviews: 412, color: '#160A2C', badge: 'cert', preset: 'cert',
      outcomes: JSON.stringify(['Forstå ITIL® 4 service management og de fire dimensioner.','Bestå den officielle Foundation-eksamen med fuld eksamensinkludering.','Anvend IT-service management praksisser i din organisation.']),
      included: JSON.stringify(['ITIL® 4 eksamen inkluderet','Officielt studiemateriale','Digitalt certifikat','Maks 12 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'2 dage',s:'+ eksamen'},{k:'Beståelsespct.',v:'88%',s:''},{k:'Bevis',v:'ITIL® 4',s:'/ PeopleCert'},{k:'Deltagere',v:'Maks 12',s:''}]),
      marquee: JSON.stringify(['ITIL® 4','Service management','IT governance','Certifikat']),
    },
    {
      title: 'Førstehjælp & HLR', slug: 'forstehjaelp-hlr',
      supplier: 'Dansk Røde Kors', cat: 'sundhed',
      price: 3200, format: 'Fysisk', dur: '1 dag', online: 0,
      rating: 4.9, reviews: 1240, color: '#0E2A1C', badge: '', preset: 'sundhed',
      outcomes: JSON.stringify(['Håndter hjertestop korrekt: HLR og brug af hjertestarter (AED).','Reagér rigtigt på kvælning, blødninger og akutte ulykker.','Modtag et DFR-anerkendt bevis gyldigt i 2 år.']),
      included: JSON.stringify(['DFR-anerkendt kursusbevis','Forplejning hele dagen','Øvelsesudstyr','Gyldig 2 år']),
      facts: JSON.stringify([{k:'Varighed',v:'1 dag',s:'/ 08–15'},{k:'Bevis',v:'DFR-anerkendt',s:'/ gyldigt 2 år'},{k:'Format',v:'Fysisk',s:'/ praktisk øvelse'},{k:'Deltagere',v:'Maks 10',s:'/ pr. instruktør'}]),
      marquee: JSON.stringify(['HLR','Hjertestarter AED','Førstehjælp','DFR-anerkendt bevis']),
    },
    {
      title: 'Psykisk Førstehjælp', slug: 'psykisk-forstehjaelp',
      supplier: 'Mind Danmark', cat: 'sundhed',
      price: 4500, format: 'Fysisk', dur: '1 dag', online: 1,
      rating: 4.7, reviews: 387, color: '#1F2E22', badge: '', preset: 'sundhed',
      outcomes: JSON.stringify(['Genkend tegn på psykisk mistrivsel hos kolleger og brugere.','Tage den svære samtale med empati og professionel distance.','Kend til de rette støttemuligheder og hvornår du skal viderehenvise.']),
      included: JSON.stringify(['Kursusbevis','Forplejning','Materialer','Maks 14 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'1 dag',s:''},{k:'Niveau',v:'Alle',s:''},{k:'Format',v:'Fysisk',s:'/ + online'},{k:'Deltagere',v:'Maks 14',s:''}]),
      marquee: JSON.stringify(['Mental trivsel','Samtale','Støtte','Psykisk sundhed']),
    },
    {
      title: 'Kloakmester (AMU)', slug: 'kloakmester-amu',
      supplier: 'TechErhverv', cat: 'amu',
      price: 0, format: 'Fysisk', dur: '5 dage', online: 0,
      rating: 4.6, reviews: 156, color: '#2E1208', badge: 'amu', preset: 'amu',
      outcomes: JSON.stringify(['Udfør kloakarbejde sikkert og korrekt efter gældende lovgivning.','Betjen og opstil udstyr selvstændigt med korrekte målemetoder.','Modtag et officielt AMU-kompetencebevis anerkendt på hele arbejdsmarkedet.']),
      included: JSON.stringify(['AMU-kompetencebevis','Sikkerhedsudstyr','Forplejning alle 5 dage','VEU-godtgørelse kan søges']),
      facts: JSON.stringify([{k:'Varighed',v:'5 dage',s:'/ 07:30–15:30'},{k:'AMU-niveau',v:'Niveau 2',s:''},{k:'Bevis',v:'AMU-bevis',s:''},{k:'Finansiering',v:'Gratis*',s:'/ for berettigede'}]),
      marquee: JSON.stringify(['AMU-finansieret','Kompetencebevis','Praktisk uddannelse','Gratis for berettigede']),
    },
    {
      title: 'Svejsning MIG/MAG (AMU)', slug: 'svejsning-mig-mag-amu',
      supplier: 'TechErhverv', cat: 'amu',
      price: 0, format: 'Fysisk', dur: '5 dage', online: 0,
      rating: 4.8, reviews: 203, color: '#201208', badge: 'amu', preset: 'amu',
      outcomes: JSON.stringify(['Udfør MIG/MAG-svejsning korrekt og sikkert efter gældende standarder.','Forstå materialevalg, parameterindstillinger og fejlfinding.','Dokumentér arbejdet professionelt og modtag AMU-kompetencebevis.']),
      included: JSON.stringify(['AMU-kompetencebevis','Sikkerhedsudstyr','Forplejning alle 5 dage','VEU-godtgørelse kan søges']),
      facts: JSON.stringify([{k:'Varighed',v:'5 dage',s:''},{k:'AMU-niveau',v:'Niveau 2',s:''},{k:'Bevis',v:'AMU-bevis',s:''},{k:'Finansiering',v:'Gratis*',s:'/ for berettigede'}]),
      marquee: JSON.stringify(['MIG/MAG svejsning','AMU-finansieret','Kompetencebevis','Industrielt håndværk']),
    },
    {
      title: 'Salgspsykologi & Indvendinger', slug: 'salgspsykologi-indvendinger',
      supplier: 'Competence Way', cat: 'salg',
      price: 7200, format: 'Fysisk', dur: '1 dag', online: 1,
      rating: 4.8, reviews: 334, color: '#2E1A0A', badge: '', preset: 'ledelse',
      outcomes: JSON.stringify(['Forstå kundens beslutningsprocess og brug det strategisk.','Håndter indvendinger professionelt og vend dem til fordele.','Luk aftaler med ægte overbevisning — ikke manipulation.']),
      included: JSON.stringify(['Kursusbevis','Forplejning','Materialer','Maks 14 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'1 dag',s:''},{k:'Niveau',v:'Alle',s:''},{k:'Format',v:'Fysisk',s:'/ + online'},{k:'Deltagere',v:'Maks 14',s:''}]),
      marquee: JSON.stringify(['Salgspsykologi','Indvending til fordel','Aftalelukke','Overbevisning']),
    },
    {
      title: 'Telefonist & Kundeservice', slug: 'telefonist-kundeservice',
      supplier: 'ServiceAkademiet', cat: 'salg',
      price: 5900, format: 'Fysisk', dur: '1 dag', online: 1,
      rating: 4.6, reviews: 278, color: '#261408', badge: '', preset: 'ledelse',
      outcomes: JSON.stringify(['Skab en professionel og varm kundeoplevelse i telefonen.','Håndter vanskelige kunder med ro og empati.','Forbedre kundetilfredshed og reducér churn.']),
      included: JSON.stringify(['Kursusbevis','Forplejning','Materialer','Maks 14 deltagere']),
      facts: JSON.stringify([{k:'Varighed',v:'1 dag',s:''},{k:'Niveau',v:'Alle',s:''},{k:'Format',v:'Fysisk',s:'/ + online'},{k:'Deltagere',v:'Maks 14',s:''}]),
      marquee: JSON.stringify(['Professionel service','Vanskelige kunder','Kundetilfredshed','Kommunikation']),
    },
  ];

  const insertCourseSql = `
    INSERT INTO courses (title, slug, supplier_id, category_id, price, format, duration, is_online,
      rating, review_count, color, badge, preset_type, status, outcomes, included, facts, marquee_items)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `;

  for (const c of courses) {
    const supId = await getSupId(c.supplier);
    const catId = await getCatId(c.cat);
    await x.run(insertCourseSql, c.title, c.slug, supId, catId, c.price, c.format, c.dur, c.online,
      c.rating, c.reviews, c.color, c.badge, c.preset, c.outcomes, c.included, c.facts, c.marquee);
  }

  // Seed sessions for Forhandlingsteknik (the hand-tuned spread)
  const insertSessionSql = `
    INSERT INTO sessions (course_id, date, location, venue, format, is_online, seats, is_popular)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const course1Id = (await x.get('SELECT id FROM courses WHERE slug=?', 'forhandlingsteknik')).id;
  const sessionData = [
    [course1Id, '2026-06-12', 'København', 'Tivoli Congress Center', 'Fysisk · 1 dag', 0, 8, 0],
    [course1Id, '2026-09-03', 'København', 'Tivoli Congress Center', 'Fysisk · 1 dag', 0, 11, 1],
    [course1Id, '2026-11-19', 'København', 'Tivoli Congress Center', 'Fysisk · 1 dag', 0, 14, 0],
    [course1Id, '2026-08-27', 'Aarhus',    'Comwell Aarhus',         'Fysisk · 1 dag', 0, 9, 1],
    [course1Id, '2026-10-14', 'Aarhus',    'Comwell Aarhus',         'Fysisk · 1 dag', 0, 14, 0],
    [course1Id, '2026-09-05', 'Odense',    'H.C. Andersen Hotel',    'Fysisk · 1 dag', 0, 2, 0],
    [course1Id, '2026-06-20', 'Online',    'Live via Zoom',           'Online · 1 dag', 1, 22, 0],
    [course1Id, '2026-07-11', 'Online',    'Live via Zoom',           'Online · 1 dag', 1, 30, 1],
    [course1Id, '2026-08-29', 'Online',    'Live via Zoom',           'Online · 1 dag', 1, 18, 0],
  ];
  for (const s of sessionData) await x.run(insertSessionSql, ...s);

  // Sample bookings
  const insertBookingSql = `
    INSERT INTO bookings (session_id, customer_name, customer_email, customer_company, participants, payment_method, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const sess1Id = (await x.get('SELECT id FROM sessions WHERE course_id=? AND date=?', course1Id, '2026-06-12')).id;
  const sampleBookings = [
    [sess1Id, 'Mette Kjær',     'mette@nordiskhandel.dk', 'Nordisk Handel',  1, 'faktura',   'confirmed'],
    [sess1Id, 'Lars Pedersen',  'lars@byggefirma.dk',     'Byg & Anlæg A/S', 2, 'ean',       'confirmed'],
    [sess1Id, 'Anne-Sophie L.', 'anne@startup.io',        'TechStartup',     1, 'kort',      'pending'],
    [sess1Id, 'Thomas Bro',     'thomas@consulting.dk',   'Nordic Consult',  1, 'mobilepay', 'pending'],
  ];
  for (const b of sampleBookings) await x.run(insertBookingSql, ...b);
}

/* ============ SESSION BACKFILL ============
   Idempotent: gives every active course a realistic spread of upcoming
   sessions. Only inserts for courses that currently have none, so it is
   safe to run on every boot and never duplicates or touches existing data
   (incl. the hand-tuned Forhandlingsteknik sessions and sample bookings). */
async function backfillSessions(x) {
  const VENUES = {
    'København': 'Tivoli Congress Center',
    'Aarhus':    'Comwell Aarhus',
    'Odense':    'H.C. Andersen Hotel',
    'Aalborg':   'Comwell Hvide Hus',
    'Online':    'Live via Zoom',
  };

  function dateInDays(offset) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  const insertSessionSql = `
    INSERT INTO sessions (course_id, date, location, venue, format, is_online, seats, is_popular)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const courses = await x.all("SELECT id, duration, format, is_online FROM courses WHERE status='active'");

  await x.transaction(async (tx) => {
    for (const course of courses) {
      const existing = (await tx.get('SELECT COUNT(*) AS n FROM sessions WHERE course_id=?', course.id)).n;
      if (existing > 0) continue; // never clobber courses that already have dates

      const dur     = course.duration || '1 dag';
      const shift   = (course.id * 5) % 21;           // spread courses apart so dates differ
      const seatPool = [4, 6, 9, 12, 14, 18, 24, 30];
      const onlineFmt   = 'Online · ' + dur;
      const physicalFmt = 'Fysisk · ' + dur;

      let plan;
      if (course.format === 'Online') {
        // online-only course
        plan = [
          ['Online', dateInDays(21 + shift), onlineFmt, 1, 0],
          ['Online', dateInDays(49 + shift), onlineFmt, 1, 1],
          ['Online', dateInDays(84 + shift), onlineFmt, 1, 0],
        ];
      } else {
        // physical course — spread across DK cities
        plan = [
          ['København', dateInDays(25 + shift), physicalFmt, 0, 0],
          ['København', dateInDays(67 + shift), physicalFmt, 0, 1],
          ['Aarhus',     dateInDays(40 + shift), physicalFmt, 0, 0],
          ['Aarhus',     dateInDays(88 + shift), physicalFmt, 0, 0],
          ['Odense',     dateInDays(54 + shift), physicalFmt, 0, 0],
        ];
        // courses that also run online get live online dates
        if (course.is_online) {
          plan.push(['Online', dateInDays(33 + shift), onlineFmt, 1, 0]);
          plan.push(['Online', dateInDays(75 + shift), onlineFmt, 1, 1]);
        }
      }

      for (let i = 0; i < plan.length; i++) {
        const [location, date, format, isOnline, popular] = plan[i];
        const seats = seatPool[(course.id + i) % seatPool.length];
        await tx.run(insertSessionSql, course.id, date, location, VENUES[location] || location, format, isOnline, seats, popular);
      }
    }
  });
}

/* ============ PUBLIC LAYER ============ */
const driver = process.env.DATABASE_URL ? pgDriver() : sqliteDriver();

const ready = (async () => {
  await driver.exec(schemaSql(driver.name === 'pg'));
  await migrate(driver);
  await seed(driver);
  await backfillSessions(driver);
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
