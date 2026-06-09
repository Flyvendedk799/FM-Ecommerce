/* ============================================================
   FUTUREMATCH — kategorier.js
   Course data, category data, overview + filtered views
   ============================================================ */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============ DATA (static fallback — overridden by API) ============ */
  let CATS = {
    ledelse: { label: 'Ledelse & Kommunikation', accent: '#FF5A1F', bg: '#2C1A0A', desc: 'Bliv en stærkere leder, kommunikator og forhandler. Kurser for alle niveauer.', count: 48 },
    it:      { label: 'IT & Data',                accent: '#3A6FF8', bg: '#0D1A38', desc: 'Excel, Power BI, Python og alt det digitale. Fra begynder til ekspert.', count: 62 },
    cert:    { label: 'Certificering',            accent: '#6B4DE0', bg: '#1E0E3C', desc: 'PRINCE2, ITIL og andre internationalt anerkendte certifikater.', count: 31 },
    sundhed: { label: 'Sundhed & Omsorg',         accent: '#2F8F63', bg: '#0E2A1C', desc: 'Førstehjælp, HLR og kurser til sundheds- og omsorgssektoren.', count: 27 },
    amu:     { label: 'AMU / Erhvervsfaglig',     accent: '#C7553A', bg: '#2E1208', desc: 'Statsfinansierede AMU-kurser — gratis for berettigede deltagere.', count: 86 },
    salg:    { label: 'Salg & Kundeservice',      accent: '#C9A227', bg: '#2E1A0A', desc: 'Sælg bedre, betjen kunder professionelt og byg stærke relationer.', count: 39 }
  };

  let COURSES = [
    { id:1,  cat:'ledelse', title:'Forhandlingsteknik',          supplier:'Competence Way',      rating:4.8, reviews:312,  dur:'1 dag',           format:'Fysisk',  online:true,  price:6900,  color:'#2C1A0A', url:'kursus.html?id=1' },
    { id:2,  cat:'ledelse', title:'Præsentationsteknik',         supplier:'Waltersdorff Consulting', rating:4.9, reviews:287, dur:'1 dag',           format:'Fysisk',  online:true,  price:6900,  color:'#1F3A2E', url:'kursus.html?id=2' },
    { id:3,  cat:'ledelse', title:'Konflikthåndtering',          supplier:'Competence Way',      rating:4.7, reviews:198,  dur:'1 dag',           format:'Fysisk',  online:false, price:6500,  color:'#3A2C19', url:'kursus.html?id=3' },
    { id:4,  cat:'ledelse', title:'Personlig gennemslagskraft',  supplier:'Waltersdorff Consulting', rating:4.8, reviews:241, dur:'2 dage',          format:'Fysisk',  online:true,  price:9900,  color:'#2A1F14', url:'kursus.html?id=4' },
    { id:5,  cat:'it',      title:'Excel — Avanceret',           supplier:'DataSkolen',          rating:4.8, reviews:445,  dur:'2 dage',          format:'Fysisk',  online:true,  price:8900,  color:'#0D1A38', url:'kursus.html?id=5' },
    { id:6,  cat:'it',      title:'Power BI Dashboard',          supplier:'DataSkolen',          rating:4.7, reviews:223,  dur:'1 dag',           format:'Online',  online:true,  price:5900,  color:'#1F2E42', url:'kursus.html?id=6' },
    { id:7,  cat:'it',      title:'Python for Professionals',    supplier:'CodeDanmark',         rating:4.6, reviews:189,  dur:'3 dage',          format:'Fysisk',  online:true,  price:12900, color:'#1A1F35', url:'kursus.html?id=7' },
    { id:8,  cat:'cert',    title:'PRINCE2® Foundation',         supplier:'PM Academy',          rating:4.9, reviews:521,  dur:'3 dage + eksamen',format:'Fysisk',  online:true,  price:14900, color:'#1E0E3C', url:'kursus.html?id=8', badge:'cert' },
    { id:9,  cat:'cert',    title:'ITIL® 4 Foundation',          supplier:'PM Academy',          rating:4.8, reviews:412,  dur:'2 dage + eksamen',format:'Fysisk',  online:true,  price:11900, color:'#160A2C', url:'kursus.html?id=9', badge:'cert' },
    { id:10, cat:'sundhed', title:'Førstehjælp & HLR',           supplier:'Dansk Røde Kors',     rating:4.9, reviews:1240, dur:'1 dag',           format:'Fysisk',  online:false, price:3200,  color:'#0E2A1C', url:'kursus.html?id=10' },
    { id:11, cat:'sundhed', title:'Psykisk Førstehjælp',         supplier:'Mind Danmark',        rating:4.7, reviews:387,  dur:'1 dag',           format:'Fysisk',  online:true,  price:4500,  color:'#1F2E22', url:'kursus.html?id=11' },
    { id:12, cat:'amu',     title:'Kloakmester (AMU)',           supplier:'TechErhverv',         rating:4.6, reviews:156,  dur:'5 dage',          format:'Fysisk',  online:false, price:0,     color:'#2E1208', url:'kursus.html?id=12', badge:'amu' },
    { id:13, cat:'amu',     title:'Svejsning MIG/MAG (AMU)',     supplier:'TechErhverv',         rating:4.8, reviews:203,  dur:'5 dage',          format:'Fysisk',  online:false, price:0,     color:'#201208', url:'kursus.html?id=13', badge:'amu' },
    { id:14, cat:'salg',    title:'Salgspsykologi & Indvendinger',supplier:'Competence Way',     rating:4.8, reviews:334,  dur:'1 dag',           format:'Fysisk',  online:true,  price:7200,  color:'#2E1A0A', url:'kursus.html?id=14' },
    { id:15, cat:'salg',    title:'Telefonist & Kundeservice',   supplier:'ServiceAkademiet',    rating:4.6, reviews:278,  dur:'1 dag',           format:'Fysisk',  online:true,  price:5900,  color:'#261408', url:'kursus.html?id=15' }
  ];

  /* ============ STATE ============ */
  let activeCat = null;
  let activeQuery = null;   // non-null when in search-results mode
  let activeFormat = 'alle';
  let activeDur = 'alle';
  let activeAvailability = 'alle';
  let activeSort = 'relevans';

  const view = document.getElementById('kat-view');
  const nav  = document.getElementById('nav');

  /* ============ NAV SCROLL ============ */
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  /* ============ REVEALS ============ */
  function initReveals() {
    var revs = document.querySelectorAll('.reveal');
    if (reduce) { revs.forEach(function(r){r.classList.add('is-in');}); return; }
    var check = function() {
      revs.forEach(function(r) {
        if (!r.classList.contains('is-in') && r.getBoundingClientRect().top < window.innerHeight * .91)
          r.classList.add('is-in');
      });
    };
    check();
    var raf;
    window.addEventListener('scroll', function() {
      if (raf) return;
      raf = requestAnimationFrame(function(){ check(); raf=null; });
    }, { passive:true });
    setTimeout(function(){ revs.forEach(function(r){r.classList.add('is-in');}); }, 1600);
  }

  /* ============ RENDER HELPERS ============ */
  function priceHTML(c) {
    if (c.badge === 'amu' || c.price === 0) return '<span class="cc-price free">Gratis*</span>';
    return '<span class="cc-price">kr. ' + c.price.toLocaleString('da-DK') + '<small> ekskl. moms</small></span>';
  }

  function fmtNextDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  function availabilityHTML(c) {
    var hasDates = c.upcomingCount > 0 && c.nextDate;
    if (!hasDates) {
      return '<div class="cc-availability muted"><span>Kontakt for dato</span><span>Firmahold muligt</span></div>';
    }
    var until = daysUntil(c.nextDate);
    var soon = until != null && until <= 30;
    var seats = c.nextSeatsRemaining;
    var seatText = seats != null && seats <= 4
      ? '<span class="cc-seat-low">' + Math.max(0, seats) + ' pladser tilbage</span>'
      : c.upcomingCount + ' dato' + (c.upcomingCount === 1 ? '' : 'er');
    return '<div class="cc-availability">' +
      '<span class="cc-date' + (soon ? ' soon' : '') + '">' + (soon ? 'Snart: ' : 'Næste: ') + escAttr(fmtNextDate(c.nextDate)) + '</span>' +
      '<span>' + seatText + '</span>' +
    '</div>';
  }

  function formatChip(c) {
    var chips = ['<span class="cc-meta-chip">' + escAttr(c.dur) + '</span>'];
    if (c.online && c.format === 'Fysisk') chips.push('<span class="cc-meta-chip">+ Online</span>');
    else chips.push('<span class="cc-meta-chip">' + escAttr(c.format) + '</span>');
    return chips.join('');
  }

  function badgeHTML(c) {
    if (c.badge === 'amu')  return '<span class="cc-badge amu">AMU-finansieret</span>';
    if (c.badge === 'cert') return '<span class="cc-badge cert">Eksamen inkluderet</span>';
    return '';
  }

  function courseCard(c) {
    var cat = CATS[c.cat];
    var catLabel = cat ? cat.label.split(' ')[0] : (c.category_label || 'Kursus');
    return '<a class="cc-card reveal" href="' + escAttr(c.url) + '">' +
      '<div class="cc-top" style="background:' + safeColor(c.color) + '">' +
        '<div class="cc-cat-row">' +
          '<span class="cc-cat">' + escAttr(catLabel) + '</span>' +
          '<span class="cc-rating"><span class="cc-star">★</span>' + c.rating + '</span>' +
        '</div>' +
        '<div class="cc-badges">' + badgeHTML(c) + '</div>' +
      '</div>' +
      '<div class="cc-body">' +
        '<h3 class="cc-title">' + escAttr(c.title) + '</h3>' +
        '<div class="cc-supplier">' + escAttr(c.supplier) + ' · ' + c.reviews.toLocaleString('da-DK') + ' anm.</div>' +
        '<div class="cc-meta">' + formatChip(c) + '</div>' +
        availabilityHTML(c) +
        '<div class="cc-foot">' + priceHTML(c) + '<span class="cc-cta">Se kursus →</span></div>' +
      '</div>' +
    '</a>';
  }

  /* ============ OVERVIEW ============ */
  function renderOverview() {
    var catKeys = Object.keys(CATS);
    var suppliersSeen = {};
    COURSES.forEach(function(c) { if (c.supplier) suppliersSeen[c.supplier] = true; });
    var supplierCount = Object.keys(suppliersSeen).length;
    var cards = catKeys.map(function(k, i) {
      var cat = CATS[k];
      var icons = {
        ledelse:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        it:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M9 10l2 2 4-4"/>',
        cert:'<circle cx="12" cy="8" r="6"/><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0L7.81 21.886a.5.5 0 0 1-.81-.47l1.514-8.526"/>',
        sundhed:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        amu:'<path d="M2 20h20M4 20V10l8-6 8 6v10M10 20v-6h4v6"/>',
        salg:'<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
      };
      var d = 'reveal-d' + (i % 5);
      return '<a class="kat-card reveal ' + d + '" href="#' + escAttr(k) + '" data-cat="' + escAttr(k) + '">' +
        '<div class="kat-card-accent" style="background:' + safeColor(cat.accent) + '"></div>' +
        '<div class="kat-card-top">' +
          '<div class="kat-badge"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (icons[k]||'') + '</svg></div>' +
          '<div class="kat-card-num">0' + (catKeys.indexOf(k)+1) + '</div>' +
        '</div>' +
        '<h3>' + escAttr(cat.label) + '</h3>' +
        '<div class="kc-desc">' + escAttr(cat.desc) + '</div>' +
        '<div class="kc-foot">' +
          '<div class="kc-count">' + cat.count + ' kurser</div>' +
          '<div class="kc-arrow">→</div>' +
        '</div>' +
      '</a>';
    }).join('');

    view.innerHTML =
      '<section class="kat-header">' +
        '<div class="kat-header-inner">' +
          '<span class="eyebrow" style="color:rgba(237,230,214,.5)">Udforsk katalog</span>' +
          '<h1 class="kat-h1">Hvad vil du <span class="ital">lære?</span></h1>' +
          '<div class="kat-search">' +
            '<input type="text" id="kat-search-input" placeholder="Søg blandt 800+ kurser..." aria-label="Søg">' +
            '<button type="button">Søg</button>' +
          '</div>' +
          '<div class="kat-quick" aria-label="Populære søgninger">' +
            '<a href="#q=excel">Excel</a>' +
            '<a href="#q=amu">AMU</a>' +
            '<a href="#q=certificering">Certificering</a>' +
            '<a href="#q=førstehjælp">Førstehjælp</a>' +
          '</div>' +
          '<div class="kat-total">' + COURSES.length + ' kurser fra ' + supplierCount + ' udbydere</div>' +
        '</div>' +
      '</section>' +
      '<section class="kat-overview wrap view-fade-in">' +
        '<div class="kat-grid">' + cards + '</div>' +
      '</section>';

    initReveals();

    // category card click
    view.querySelectorAll('[data-cat]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.preventDefault();
        var k = el.getAttribute('data-cat');
        window.location.hash = k;
      });
    });

    // search — real cross-catalog search results
    var si  = document.getElementById('kat-search-input');
    var sbt = view.querySelector('.kat-search button');
    function runSearch() {
      var val = si && si.value.trim();
      if (val) window.location.hash = 'q=' + encodeURIComponent(val);
    }
    if (si)  si.addEventListener('keydown', function(e){ if (e.key === 'Enter') runSearch(); });
    if (sbt) sbt.addEventListener('click', runSearch);
  }

  /* ============ FILTERING (shared by category + search views) ============ */
  function applyFilters(list) {
    return list.filter(function(c) {
      if (activeFormat === 'online' && !c.online) return false;
      if (activeFormat === 'fysisk' && c.online && c.format === 'Online') return false;
      if (activeDur === '1dag' && c.dur !== '1 dag') return false;
      if (activeDur === 'multi' && (c.dur === '1 dag')) return false;
      if (activeAvailability === 'datoer' && !c.upcomingCount) return false;
      if (activeAvailability === 'snart') {
        var until = daysUntil(c.nextDate);
        if (until == null || until > 45) return false;
      }
      return true;
    }).sort(function(a,b) {
      if (activeSort === 'rating') return b.rating - a.rating;
      if (activeSort === 'pris-asc') return a.price - b.price;
      if (activeSort === 'pris-desc') return b.price - a.price;
      if (activeSort === 'dato') {
        if (!a.nextDate && !b.nextDate) return 0;
        if (!a.nextDate) return 1;
        if (!b.nextDate) return -1;
        return a.nextDate.localeCompare(b.nextDate);
      }
      return 0; // relevans = original order
    });
  }

  function courseMatches(c, q) {
    var hay = [
      c.title || '',
      c.supplier || '',
      (CATS[c.cat] ? CATS[c.cat].label : ''),
      c.format || '',
      c.dur || '',
      c.nextDate ? fmtNextDate(c.nextDate) : ''
    ].join(' ').toLowerCase();
    // every whitespace-separated term must be present (AND search)
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function(term){
      return hay.indexOf(term) >= 0;
    });
  }

  // Result set for the current view — category mode or search mode.
  function getResults() {
    var base = (activeQuery != null)
      ? COURSES.filter(function(c){ return courseMatches(c, activeQuery); })
      : COURSES.filter(function(c){ return c.cat === activeCat; });
    return applyFilters(base);
  }

  function renderCourseGrid() {
    var courses = getResults();
    var grid = document.getElementById('course-grid-inner');
    if (!grid) return;
    var countEl = document.getElementById('result-count');
    if (countEl) {
      var noun = courses.length === 1 ? 'kursus' : 'kurser';
      countEl.textContent = courses.length + ' ' + noun + ' matcher';
    }
    var clear = document.getElementById('clear-filters');
    if (clear) {
      clear.hidden = activeFormat === 'alle' && activeDur === 'alle' &&
        activeAvailability === 'alle' && activeSort === 'relevans';
    }
    if (courses.length === 0) {
      grid.innerHTML = activeQuery != null
        ? '<div class="no-courses"><h3>Ingen kurser matcher “' + escAttr(activeQuery) + '”</h3><p>Prøv et andet søgeord eller udforsk kategorierne.</p></div>'
        : '<div class="no-courses"><h3>Ingen kurser matcher filteret</h3><p>Prøv at fjerne et filter.</p></div>';
      return;
    }
    grid.innerHTML = courses.map(courseCard).join('');
    initReveals();
  }

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Validate a value as a hex CSS color before interpolating into style="" —
  // fall back to the default ink color if it isn't a clean hex value.
  function safeColor(v) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? v : '#2C1A0A';
  }

  function renderCategory(catKey) {
    var cat = CATS[catKey];
    if (!cat) { renderOverview(); return; }
    activeCat = catKey;
    activeQuery = null;

    // sidebar nav items
    var sidebarItems = Object.keys(CATS).map(function(k) {
      return '<button class="sidebar-cat' + (k===catKey?' active':'') + '" data-cat="' + escAttr(k) + '" style="' + (k===catKey?'background:var(--ink);color:var(--paper);':'') + '">' +
        '<span class="sidebar-dot" style="background:' + safeColor(CATS[k].accent) + '"></span>' + escAttr(CATS[k].label) +
      '</button>';
    }).join('');

    view.innerHTML =
      '<section class="cat-view-header">' +
        '<div class="wrap">' +
          '<div class="cat-breadcrumb">' +
            '<a href="#" id="back-link">Alle kurser</a>' +
            '<span class="sep">›</span>' +
            '<span style="color:rgba(237,230,214,.8)">' + escAttr(cat.label) + '</span>' +
          '</div>' +
          '<span class="cat-accent-chip" style="background:' + safeColor(cat.accent) + ';color:' + (cat.accent==='#C9A227'?'#1A1200':'#fff') + ';margin-bottom:16px">' + escAttr(cat.label) + '</span>' +
          '<h1 class="cat-view-title">' + escAttr(cat.label) + '</h1>' +
          '<p class="cat-view-desc">' + escAttr(cat.desc) + '</p>' +
          '<div class="cat-view-meta"><span class="cat-view-count">' + cat.count + ' kurser tilgængelige</span></div>' +
        '</div>' +
      '</section>' +

      '<div class="filter-bar" id="filter-bar">' +
        '<div class="filter-inner">' +
          '<span class="filter-label">Format</span>' +
          '<div class="filter-group">' +
            '<button class="f-chip' + (activeFormat==='alle'?' active':'') + '" data-filter="format" data-val="alle">Alle</button>' +
            '<button class="f-chip' + (activeFormat==='fysisk'?' active':'') + '" data-filter="format" data-val="fysisk">Fysisk</button>' +
            '<button class="f-chip' + (activeFormat==='online'?' active':'') + '" data-filter="format" data-val="online">Online</button>' +
          '</div>' +
          '<div class="filter-sep"></div>' +
          '<span class="filter-label">Varighed</span>' +
          '<div class="filter-group">' +
            '<button class="f-chip' + (activeDur==='alle'?' active':'') + '" data-filter="dur" data-val="alle">Alle</button>' +
            '<button class="f-chip' + (activeDur==='1dag'?' active':'') + '" data-filter="dur" data-val="1dag">1 dag</button>' +
            '<button class="f-chip' + (activeDur==='multi'?' active':'') + '" data-filter="dur" data-val="multi">2+ dage</button>' +
          '</div>' +
          '<div class="filter-sep"></div>' +
          '<span class="filter-label">Dato</span>' +
          '<div class="filter-group">' +
            '<button class="f-chip' + (activeAvailability==='alle'?' active':'') + '" data-filter="availability" data-val="alle">Alle</button>' +
            '<button class="f-chip' + (activeAvailability==='datoer'?' active':'') + '" data-filter="availability" data-val="datoer">Med datoer</button>' +
            '<button class="f-chip' + (activeAvailability==='snart'?' active':'') + '" data-filter="availability" data-val="snart">Snart</button>' +
          '</div>' +
          '<div class="filter-sort">' +
            'Sorter: <select id="sort-sel">' +
              '<option value="relevans"' + (activeSort==='relevans'?' selected':'') + '>Relevans</option>' +
              '<option value="dato"' + (activeSort==='dato'?' selected':'') + '>Næste dato</option>' +
              '<option value="rating"' + (activeSort==='rating'?' selected':'') + '>Rating</option>' +
              '<option value="pris-asc"' + (activeSort==='pris-asc'?' selected':'') + '>Pris ↑</option>' +
              '<option value="pris-desc"' + (activeSort==='pris-desc'?' selected':'') + '>Pris ↓</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="wrap">' +
        '<div class="cat-layout">' +
          '<nav class="cat-sidebar">' + sidebarItems + '</nav>' +
          '<div>' +
            '<div class="results-bar"><span id="result-count"></span><button type="button" id="clear-filters" hidden>Ryd filtre</button></div>' +
            '<div class="course-grid view-fade-in" id="course-grid-inner"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    renderCourseGrid();

    // back link
    var back = document.getElementById('back-link');
    if (back) back.addEventListener('click', function(e) { e.preventDefault(); window.location.hash = ''; });

    // filter chips
    view.querySelectorAll('.f-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var filter = btn.getAttribute('data-filter');
        var val = btn.getAttribute('data-val');
        if (filter === 'format') activeFormat = val;
        if (filter === 'dur') activeDur = val;
        if (filter === 'availability') activeAvailability = val;
        view.querySelectorAll('[data-filter="' + filter + '"]').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        renderCourseGrid();
      });
    });

    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function() {
      activeFormat = 'alle'; activeDur = 'alle'; activeAvailability = 'alle'; activeSort = 'relevans';
      renderCategory(catKey);
    });

    // sort
    var sortSel = document.getElementById('sort-sel');
    if (sortSel) sortSel.addEventListener('change', function() {
      activeSort = sortSel.value;
      renderCourseGrid();
    });

    // sidebar nav
    view.querySelectorAll('.sidebar-cat').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var k = btn.getAttribute('data-cat');
        window.location.hash = k;
      });
    });

    // footer nav links
    document.querySelectorAll('.kat-nav-link').forEach(function(a) {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        var h = a.getAttribute('href').slice(1);
        window.location.hash = h;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  }

  /* ============ SEARCH RESULTS VIEW ============ */
  function renderSearch(q) {
    activeCat = null;
    activeQuery = q;

    var matchCount = COURSES.filter(function(c){ return courseMatches(c, q); }).length;

    // sidebar lets users jump into a category to refine
    var sidebarItems = Object.keys(CATS).map(function(k) {
      return '<button class="sidebar-cat" data-cat="' + escAttr(k) + '">' +
        '<span class="sidebar-dot" style="background:' + safeColor(CATS[k].accent) + '"></span>' + escAttr(CATS[k].label) +
      '</button>';
    }).join('');

    view.innerHTML =
      '<section class="cat-view-header">' +
        '<div class="wrap">' +
          '<div class="cat-breadcrumb">' +
            '<a href="#" id="back-link">Alle kurser</a>' +
            '<span class="sep">›</span>' +
            '<span style="color:rgba(237,230,214,.8)">Søgning</span>' +
          '</div>' +
          '<h1 class="cat-view-title">“' + escAttr(q) + '”</h1>' +
          '<p class="cat-view-desc">' + matchCount + ' ' + (matchCount === 1 ? 'kursus' : 'kurser') + ' matcher din søgning.</p>' +
          '<div class="kat-search" style="margin-top:20px;max-width:540px">' +
            '<input type="text" id="kat-search-input" value="' + escAttr(q) + '" placeholder="Søg blandt kurser..." aria-label="Søg">' +
            '<button type="button" id="kat-search-btn">Søg</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<div class="filter-bar" id="filter-bar">' +
        '<div class="filter-inner">' +
          '<span class="filter-label">Format</span>' +
          '<div class="filter-group">' +
            '<button class="f-chip' + (activeFormat==='alle'?' active':'') + '" data-filter="format" data-val="alle">Alle</button>' +
            '<button class="f-chip' + (activeFormat==='fysisk'?' active':'') + '" data-filter="format" data-val="fysisk">Fysisk</button>' +
            '<button class="f-chip' + (activeFormat==='online'?' active':'') + '" data-filter="format" data-val="online">Online</button>' +
          '</div>' +
          '<div class="filter-sep"></div>' +
          '<span class="filter-label">Varighed</span>' +
          '<div class="filter-group">' +
            '<button class="f-chip' + (activeDur==='alle'?' active':'') + '" data-filter="dur" data-val="alle">Alle</button>' +
            '<button class="f-chip' + (activeDur==='1dag'?' active':'') + '" data-filter="dur" data-val="1dag">1 dag</button>' +
            '<button class="f-chip' + (activeDur==='multi'?' active':'') + '" data-filter="dur" data-val="multi">2+ dage</button>' +
          '</div>' +
          '<div class="filter-sep"></div>' +
          '<span class="filter-label">Dato</span>' +
          '<div class="filter-group">' +
            '<button class="f-chip' + (activeAvailability==='alle'?' active':'') + '" data-filter="availability" data-val="alle">Alle</button>' +
            '<button class="f-chip' + (activeAvailability==='datoer'?' active':'') + '" data-filter="availability" data-val="datoer">Med datoer</button>' +
            '<button class="f-chip' + (activeAvailability==='snart'?' active':'') + '" data-filter="availability" data-val="snart">Snart</button>' +
          '</div>' +
          '<div class="filter-sort">' +
            'Sorter: <select id="sort-sel">' +
              '<option value="relevans"' + (activeSort==='relevans'?' selected':'') + '>Relevans</option>' +
              '<option value="dato"' + (activeSort==='dato'?' selected':'') + '>Næste dato</option>' +
              '<option value="rating"' + (activeSort==='rating'?' selected':'') + '>Rating</option>' +
              '<option value="pris-asc"' + (activeSort==='pris-asc'?' selected':'') + '>Pris ↑</option>' +
              '<option value="pris-desc"' + (activeSort==='pris-desc'?' selected':'') + '>Pris ↓</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="wrap">' +
        '<div class="cat-layout">' +
          '<nav class="cat-sidebar">' + sidebarItems + '</nav>' +
          '<div>' +
            '<div class="results-bar"><span id="result-count"></span><button type="button" id="clear-filters" hidden>Ryd filtre</button></div>' +
            '<div class="course-grid view-fade-in" id="course-grid-inner"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    renderCourseGrid();

    // back to overview
    var back = document.getElementById('back-link');
    if (back) back.addEventListener('click', function(e) { e.preventDefault(); window.location.hash = ''; });

    // refine search
    function submitSearch() {
      var si = document.getElementById('kat-search-input');
      var val = si && si.value.trim();
      if (val) window.location.hash = 'q=' + encodeURIComponent(val);
    }
    var sbtn = document.getElementById('kat-search-btn');
    if (sbtn) sbtn.addEventListener('click', submitSearch);
    var sinput = document.getElementById('kat-search-input');
    if (sinput) sinput.addEventListener('keydown', function(e){ if (e.key === 'Enter') submitSearch(); });

    // filter chips
    view.querySelectorAll('.f-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var filter = btn.getAttribute('data-filter');
        var val = btn.getAttribute('data-val');
        if (filter === 'format') activeFormat = val;
        if (filter === 'dur') activeDur = val;
        if (filter === 'availability') activeAvailability = val;
        view.querySelectorAll('[data-filter="' + filter + '"]').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        renderCourseGrid();
      });
    });

    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function() {
      activeFormat = 'alle'; activeDur = 'alle'; activeAvailability = 'alle'; activeSort = 'relevans';
      renderSearch(q);
    });

    // sort
    var sortSel = document.getElementById('sort-sel');
    if (sortSel) sortSel.addEventListener('change', function() {
      activeSort = sortSel.value;
      renderCourseGrid();
    });

    // sidebar → jump into a category
    view.querySelectorAll('.sidebar-cat').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.location.hash = btn.getAttribute('data-cat');
      });
    });
  }

  /* ============ ROUTING ============ */
  function route() {
    var hash = window.location.hash.slice(1);
    activeFormat = 'alle'; activeDur = 'alle'; activeAvailability = 'alle'; activeSort = 'relevans';
    if (hash.indexOf('q=') === 0) {
      var q = decodeURIComponent(hash.slice(2));
      if (q.trim()) renderSearch(q.trim());
      else renderOverview();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    if (hash && CATS[hash]) renderCategory(hash);
    else renderOverview();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ============ INIT — fetch live data from API ============ */
  function init() {
    Promise.all([
      fetch('/api/categories').then(function(r) { return r.ok ? r.json() : null; }),
      fetch('/api/courses?status=active').then(function(r) { return r.ok ? r.json() : null; })
    ]).then(function(results) {
      var catsArr   = results[0];
      var coursesArr = results[1];

      if (catsArr && catsArr.length) {
        CATS = {};
        catsArr.forEach(function(cat) {
          CATS[cat.key] = {
            label:  cat.label,
            accent: cat.accent,
            bg:     cat.bg,
            desc:   cat.description || '',
            count:  cat.course_count || 0
          };
        });
      }

      if (coursesArr && coursesArr.length) {
        COURSES = coursesArr.map(function(c) {
          return {
            id:       c.id,
            cat:      c.category_key,
            title:    c.title,
            supplier: c.supplier_name || '',
            rating:   c.rating || 0,
            reviews:  c.review_count || 0,
            dur:      c.duration || '',
            format:   c.format || 'Fysisk',
            online:   Boolean(c.is_online),
            price:    c.price || 0,
            color:    c.color || '#2C1A0A',
            badge:    c.badge || null,
            nextDate: c.next_session_date || '',
            upcomingCount: Number(c.upcoming_session_count || 0),
            nextSeatsRemaining: c.next_session_seats_remaining == null ? null : Number(c.next_session_seats_remaining),
            minSeatsRemaining: c.min_seats_remaining == null ? null : Number(c.min_seats_remaining),
            url:      'kursus.html?id=' + c.id
          };
        });
      }
    }).catch(function() {
      // silently fall back to hardcoded data
    }).finally(function() {
      window.addEventListener('hashchange', route);
      route();

      document.querySelectorAll('.kat-nav-link').forEach(function(a) {
        a.addEventListener('click', function(e) {
          e.preventDefault();
          window.location.hash = a.getAttribute('href').slice(1);
          window.scrollTo({ top: 0, behavior: 'auto' });
        });
      });
    });
  }

  init();

})();
