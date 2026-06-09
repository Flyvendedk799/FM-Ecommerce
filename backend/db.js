const Database = require('better-sqlite3');
const path = require('path');

// Env-overridable so tests can use ':memory:' and never touch the real DB.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'futurematch.db');
const db = new Database(DB_PATH);

// WAL only applies to file-backed DBs; ':memory:' ignores it harmlessly.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ============ SCHEMA ============ */
db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    abbr TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    website TEXT DEFAULT '',
    description TEXT DEFAULT '',
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    accent TEXT DEFAULT '#FF5A1F',
    bg TEXT DEFAULT '#2C1A0A',
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    venue TEXT DEFAULT '',
    format TEXT DEFAULT 'Fysisk · 1 dag',
    is_online INTEGER DEFAULT 0,
    seats INTEGER DEFAULT 14,
    is_popular INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_company TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    participants INTEGER DEFAULT 1,
    payment_method TEXT DEFAULT 'faktura',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at TEXT DEFAULT (datetime('now'))
  );

  /* ---- indexes on foreign keys / hot filters ---- */
  CREATE INDEX IF NOT EXISTS idx_courses_supplier  ON courses(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_courses_category  ON courses(category_id);
  CREATE INDEX IF NOT EXISTS idx_courses_status    ON courses(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_course   ON sessions(course_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_session  ON bookings(session_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_inquiries_course  ON inquiries(course_id);
  CREATE INDEX IF NOT EXISTS idx_inquiries_status  ON inquiries(status);
`);

/* ============ SEED DATA ============ */
function seed() {
  const catCount = db.prepare('SELECT COUNT(*) as n FROM categories').get().n;
  if (catCount > 0) return;

  const insertCat = db.prepare(`
    INSERT INTO categories (key, label, accent, bg, description, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const cats = [
    ['ledelse', 'Ledelse & Kommunikation', '#FF5A1F', '#2C1A0A', 'Bliv en stærkere leder, kommunikator og forhandler. Kurser for alle niveauer.', 1],
    ['it',      'IT & Data',               '#3A6FF8', '#0D1A38', 'Excel, Power BI, Python og alt det digitale. Fra begynder til ekspert.', 2],
    ['cert',    'Certificering',            '#6B4DE0', '#1E0E3C', 'PRINCE2, ITIL og andre internationalt anerkendte certifikater.', 3],
    ['sundhed', 'Sundhed & Omsorg',         '#2F8F63', '#0E2A1C', 'Førstehjælp, HLR og kurser til sundheds- og omsorgssektoren.', 4],
    ['amu',     'AMU / Erhvervsfaglig',     '#C7553A', '#2E1208', 'Statsfinansierede AMU-kurser — gratis for berettigede deltagere.', 5],
    ['salg',    'Salg & Kundeservice',      '#C9A227', '#2E1A0A', 'Sælg bedre, betjen kunder professionelt og byg stærke relationer.', 6],
  ];
  cats.forEach(c => insertCat.run(...c));

  const insertSupplier = db.prepare(`
    INSERT INTO suppliers (name, abbr, email, phone, website, description, rating, review_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
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
  suppliers.forEach(s => insertSupplier.run(...s));

  const getCatId = key => db.prepare('SELECT id FROM categories WHERE key=?').get(key).id;
  const getSupId = name => db.prepare('SELECT id FROM suppliers WHERE name=?').get(name).id;

  const insertCourse = db.prepare(`
    INSERT INTO courses (title, slug, supplier_id, category_id, price, format, duration, is_online,
      rating, review_count, color, badge, preset_type, status,
      outcomes, included, facts, marquee_items)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `);

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

  const insertCourse2 = db.prepare(`
    INSERT INTO courses (title, slug, supplier_id, category_id, price, format, duration, is_online,
      rating, review_count, color, badge, preset_type, status, outcomes, included, facts, marquee_items)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `);

  courses.forEach(c => {
    const supId = getSupId(c.supplier);
    const catId = getCatId(c.cat);
    insertCourse2.run(c.title, c.slug, supId, catId, c.price, c.format, c.dur, c.online,
      c.rating, c.reviews, c.color, c.badge, c.preset, c.outcomes, c.included, c.facts, c.marquee);
  });

  // Seed sessions for Forhandlingsteknik (course id=1)
  const insertSession = db.prepare(`
    INSERT INTO sessions (course_id, date, location, venue, format, is_online, seats, is_popular)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const course1Id = db.prepare('SELECT id FROM courses WHERE slug=?').get('forhandlingsteknik').id;
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
  sessionData.forEach(s => insertSession.run(...s));

  // Sample bookings
  const insertBooking = db.prepare(`
    INSERT INTO bookings (session_id, customer_name, customer_email, customer_company, participants, payment_method, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const sess1Id = db.prepare('SELECT id FROM sessions WHERE course_id=? AND date=?').get(course1Id, '2026-06-12').id;
  [
    [sess1Id, 'Mette Kjær',     'mette@nordiskhandel.dk', 'Nordisk Handel',  1, 'faktura',   'confirmed'],
    [sess1Id, 'Lars Pedersen',  'lars@byggefirma.dk',     'Byg & Anlæg A/S', 2, 'ean',       'confirmed'],
    [sess1Id, 'Anne-Sophie L.', 'anne@startup.io',        'TechStartup',     1, 'kort',      'pending'],
    [sess1Id, 'Thomas Bro',     'thomas@consulting.dk',   'Nordic Consult',  1, 'mobilepay', 'pending'],
  ].forEach(b => insertBooking.run(...b));
}

seed();

/* ============ SESSION BACKFILL ============
   Idempotent: gives every active course a realistic spread of upcoming
   sessions. Only inserts for courses that currently have none, so it is
   safe to run on every boot and never duplicates or touches existing data
   (incl. the hand-tuned Forhandlingsteknik sessions and sample bookings). */
function backfillSessions() {
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

  const insertSession = db.prepare(`
    INSERT INTO sessions (course_id, date, location, venue, format, is_online, seats, is_popular)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const courses = db.prepare("SELECT id, duration, format, is_online FROM courses WHERE status='active'").all();

  const insertMany = db.transaction(() => {
    courses.forEach(course => {
      const existing = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE course_id=?').get(course.id).n;
      if (existing > 0) return; // never clobber courses that already have dates

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

      plan.forEach((p, i) => {
        const [location, date, format, isOnline, popular] = p;
        const seats = seatPool[(course.id + i) % seatPool.length];
        insertSession.run(course.id, date, location, VENUES[location] || location, format, isOnline, seats, popular);
      });
    });
  });

  insertMany();
}

backfillSessions();

module.exports = db;
