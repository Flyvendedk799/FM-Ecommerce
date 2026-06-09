/* ============================================================
   FUTUREMATCH — app.js
   ============================================================ */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- reveals are pure CSS (see styles.css); no JS needed ---------- */

  /* ---------- nav scrolled state + sticky bar ---------- */
  const nav = document.getElementById('nav');
  const stickybar = document.getElementById('stickybar');
  const datoer = document.getElementById('datoer');
  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 30);
    // show sticky bar after hero, hide when contact/footer in view
    const show = y > 620 && (y + window.innerHeight) < (document.body.scrollHeight - 480);
    stickybar.classList.toggle('show', show);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- smooth scroll buttons ---------- */
  document.querySelectorAll('[data-scroll]').forEach(b => {
    b.addEventListener('click', () => {
      const t = document.querySelector(b.dataset.scroll);
      if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ---------- hero parallax ---------- */
  if (!reduce) {
    const px = document.querySelector('[data-parallax]');
    if (px) {
      let raf;
      window.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          const r = px.getBoundingClientRect();
          const off = (r.top - window.innerHeight / 2) * -0.04;
          px.style.transform = `translateY(${off.toFixed(1)}px)`;
          raf = null;
        });
      }, { passive: true });
    }
  }

  /* ============================================================
     SESSION PICKER
     ============================================================ */
  let SESSIONS = {
    kbh: [
      { d: '12', m: 'Jun', loc: 'København', venue: 'Tivoli Congress Center', format: 'Fysisk · 1 dag', online: false, seats: 4 },
      { d: '03', m: 'Sep', loc: 'København', venue: 'Tivoli Congress Center', format: 'Fysisk · 1 dag', online: false, seats: 11, popular: true },
      { d: '19', m: 'Nov', loc: 'København', venue: 'Tivoli Congress Center', format: 'Fysisk · 1 dag', online: false, seats: 14 }
    ],
    aarhus: [
      { d: '27', m: 'Aug', loc: 'Aarhus', venue: 'Comwell Aarhus', format: 'Fysisk · 1 dag', online: false, seats: 9, popular: true },
      { d: '14', m: 'Okt', loc: 'Aarhus', venue: 'Comwell Aarhus', format: 'Fysisk · 1 dag', online: false, seats: 14 }
    ],
    odense: [
      { d: '05', m: 'Sep', loc: 'Odense', venue: 'H.C. Andersen Hotel', format: 'Fysisk · 1 dag', online: false, seats: 2 }
    ],
    aalborg: 'contact',
    online: [
      { d: '20', m: 'Jun', loc: 'Online', venue: 'Live via Zoom', format: 'Online · 1 dag', online: true, seats: 22 },
      { d: '11', m: 'Jul', loc: 'Online', venue: 'Live via Zoom', format: 'Online · 1 dag', online: true, seats: 30, popular: true },
      { d: '29', m: 'Aug', loc: 'Online', venue: 'Live via Zoom', format: 'Online · 1 dag', online: true, seats: 18 }
    ]
  };
  const MONTH_FULL = { Jan:'januar', Feb:'februar', Mar:'marts', Apr:'april', Maj:'maj', Jun: 'juni', Jul: 'juli', Aug: 'august', Sep: 'september', Okt: 'oktober', Nov: 'november', Dec:'december' };
  const LOC_KEY_MAP = { 'København':'kbh', 'Aarhus':'aarhus', 'Odense':'odense', 'Aalborg':'aalborg', 'Online':'online' };

  const list = document.getElementById('session-list');
  const locTabs = document.getElementById('loc-tabs');
  let tabs = Array.prototype.slice.call(document.querySelectorAll('.loc-tab'));
  const sumLoc = document.getElementById('sum-loc');
  const sumDate = document.getElementById('sum-date');
  const sumFormat = document.getElementById('sum-format');
  const sumScarcity = document.getElementById('sum-scarcity');
  const sbSub = document.getElementById('sb-sub');
  let current = 'kbh';
  let selectedSessionId = null;

  if (list) {
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Vælg en dato og lokation');
  }

  function setScarcity(seats) {
    if (!sumScarcity) return;
    if (seats != null && seats <= 6) {
      sumScarcity.innerHTML = `<span class="sc-dot"></span>Kun ${seats} pladser tilbage på dette hold`;
      sumScarcity.hidden = false;
    } else {
      sumScarcity.hidden = true;
    }
  }

  function pickSession(card) {
    list.querySelectorAll('.session').forEach(s => {
      s.setAttribute('aria-selected', 'false');
      s.setAttribute('aria-checked', 'false');
      s.tabIndex = -1;
    });
    card.setAttribute('aria-selected', 'true');
    card.setAttribute('aria-checked', 'true');
    card.tabIndex = 0;
    const dt = card.dataset;
    selectedSessionId = dt.sessionId ? parseInt(dt.sessionId, 10) : null;
    sumLoc.textContent = dt.loc;
    sumDate.textContent = `${parseInt(dt.day, 10)}. ${MONTH_FULL[dt.month] || dt.month} 2026`;
    sumFormat.textContent = dt.format;
    sbSub.textContent = `${dt.loc} · ${parseInt(dt.day, 10)}. ${MONTH_FULL[dt.month] || dt.month} · ${dt.online === 'true' ? 'Online' : 'Fysisk'}`;
    setScarcity(dt.seats ? parseInt(dt.seats, 10) : null);
  }

  // Move selection+focus to a sibling session row (keyboard arrow nav).
  function moveSession(current, dir) {
    const rows = Array.prototype.slice.call(list.querySelectorAll('.session'));
    const idx = rows.indexOf(current);
    if (idx < 0) return;
    const next = rows[(idx + dir + rows.length) % rows.length];
    if (next) { pickSession(next); next.focus(); }
  }

  function renderLoc(loc) {
    current = loc;
    const data = SESSIONS[loc];
    list.innerHTML = '';
    if (data === 'contact') {
      const nd = document.createElement('div');
      nd.className = 'no-dates';
      nd.innerHTML = `
        <div class="nd-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg></div>
        <div>
          <div class="nd-t">Ingen faste datoer i Aalborg lige nu</div>
          <div class="nd-s">Ring til os på 77&nbsp;300&nbsp;123 eller skriv til kurser@cw.dk — så finder vi en dato der passer dit hold.</div>
        </div>`;
      list.appendChild(nd);
      sumLoc.textContent = 'Aalborg';
      sumDate.textContent = 'Kontakt os';
      sumFormat.textContent = 'Efter aftale';
      setScarcity(null);
      return;
    }
    data.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'session';
      el.setAttribute('role', 'radio');
      el.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      el.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
      el.tabIndex = i === 0 ? 0 : -1;
      el.dataset.loc = s.loc; el.dataset.day = s.d; el.dataset.month = s.m;
      el.dataset.format = s.format; el.dataset.online = String(s.online); el.dataset.seats = s.seats;
      if (s.id) el.dataset.sessionId = s.id;
      const seatTxt = s.seats <= 4
        ? `<span class="low">Kun ${s.seats} pladser</span>`
        : `<b>${s.seats}</b> pladser`;
      const popTag = s.popular ? `<span class="session-pop">Populært</span>` : '';
      el.innerHTML = `
        <div class="session-date"><div class="d">${s.d}</div><div class="m">${s.m}</div></div>
        <div class="session-main">
          <div class="sloc">${s.venue} ${popTag}</div>
          <div class="smeta"><span>${s.loc}</span><span>09:00–16:00</span></div>
        </div>
        <span class="session-format ${s.online ? 'online' : ''}">${s.online ? 'Online' : 'Fysisk'}</span>
        <div class="session-seats">${seatTxt}</div>
        <span class="session-radio"></span>`;
      el.addEventListener('click', () => pickSession(el));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          pickSession(el);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          moveSession(el, 1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          moveSession(el, -1);
        }
      });
      list.appendChild(el);
    });
    const first = list.querySelector('.session');
    if (first) pickSession(first);
  }

  function setActiveTab(t) {
    tabs.forEach(x => { x.setAttribute('aria-selected', 'false'); x.tabIndex = -1; });
    t.setAttribute('aria-selected', 'true');
    t.tabIndex = 0;
    renderLoc(t.dataset.loc);
  }

  // (Re)bind click + keyboard handlers across the current tab set. Roving
  // tabindex + ArrowLeft/Right/Home/End make the tablist keyboard operable.
  function bindTabs() {
    tabs.forEach((t, i) => {
      t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1;
      t.addEventListener('click', () => setActiveTab(t));
      t.addEventListener('keydown', e => {
        let target = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') target = tabs[0];
        else if (e.key === 'End') target = tabs[tabs.length - 1];
        if (target) { e.preventDefault(); setActiveTab(target); target.focus(); }
      });
    });
  }
  bindTabs();
  renderLoc('kbh');

  // Rebuild the location tablist from a live set of keys so sessions whose
  // location has no matching static tab are never hidden. Each key maps to a
  // SESSIONS bucket; the label prefers the human location name when available.
  function rebuildTabs(keys, labels) {
    if (!locTabs) return;
    locTabs.innerHTML = '';
    keys.forEach((k, i) => {
      const btn = document.createElement('button');
      btn.className = 'loc-tab';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      btn.dataset.loc = k;
      btn.innerHTML = '<span class="lpin"></span>' + escHtml(labels[k] || k);
      locTabs.appendChild(btn);
    });
    tabs = Array.prototype.slice.call(locTabs.querySelectorAll('.loc-tab'));
    bindTabs();
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Fetch live sessions from API and re-render
  fetch('/api/sessions?course_id=1')
    .then(r => r.ok ? r.json() : null)
    .then(function(sessions) {
      if (!sessions || !sessions.length) return;
      const built = { kbh:[], aarhus:[], odense:[], aalborg:'contact', online:[] };
      const labels = { kbh:'København', aarhus:'Aarhus', odense:'Odense', aalborg:'Aalborg', online:'Online' };
      // Track order of appearance for tabs we have to add dynamically.
      const dynamicKeys = [];
      sessions.forEach(function(s) {
        // Guard: a null/undefined location must not throw and abort the re-render.
        const locName = s.location || '';
        const key = LOC_KEY_MAP[locName] || (locName.toLowerCase().replace(/\s/g, '') || 'andre');
        if (!built[key] || built[key] === 'contact') built[key] = [];
        if (!labels[key]) { labels[key] = locName || 'Andre datoer'; }
        if (!LOC_KEY_MAP[locName] && dynamicKeys.indexOf(key) < 0 && !({kbh:1,aarhus:1,odense:1,aalborg:1,online:1}[key])) {
          dynamicKeys.push(key);
        }
        const seats = (s.seats_remaining != null ? s.seats_remaining : s.seats);
        built[key].push({ id: s.id, d: s.day, m: s.month, loc: locName, venue: s.venue || '', format: s.format, online: Boolean(s.is_online), seats: seats, popular: Boolean(s.is_popular) });
      });
      // only use aalborg 'contact' if no sessions found there
      if (!Array.isArray(built.aalborg) || !built.aalborg.length) built.aalborg = 'contact';
      SESSIONS = built;

      // Rebuild the tablist so every location with live inventory is reachable:
      // keep the known order, then append any unmapped/dynamic locations.
      const orderedKeys = ['kbh','aarhus','odense','aalborg','online']
        .filter(k => Array.isArray(built[k]) ? built[k].length : built[k] === 'contact')
        .concat(dynamicKeys.filter(k => Array.isArray(built[k]) && built[k].length));
      if (orderedKeys.length) {
        rebuildTabs(orderedKeys, labels);
        current = orderedKeys.indexOf(current) >= 0 ? current : orderedKeys[0];
      }
      renderLoc(current);
    })
    .catch(function() {});

  /* ============================================================
     BOOKING MODAL
     ============================================================ */
  const bookingOverlay = document.getElementById('booking-overlay');
  const bookingCta     = document.getElementById('booking-cta');
  let bookingLastFocused = null;

  const BM_FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function bmActivePanel() {
    const success = document.getElementById('bm-success-step');
    const form    = document.getElementById('bm-form-step');
    if (success && !success.hidden) return success;
    return form || bookingOverlay;
  }
  function bmFocusables() {
    const panel = bmActivePanel() || bookingOverlay;
    return Array.prototype.slice.call(panel.querySelectorAll(BM_FOCUSABLE))
      .filter(function(el){ return el.offsetWidth || el.offsetHeight || el.getClientRects().length; });
  }

  // Hide the rest of the page from AT + tab order while the modal is open.
  function bmSetChromeInert(on) {
    Array.prototype.forEach.call(document.body.children, function(el) {
      if (el === bookingOverlay) return;
      if (on) {
        if ('inert' in HTMLElement.prototype) el.inert = true;
        else el.setAttribute('aria-hidden', 'true');
      } else {
        if ('inert' in HTMLElement.prototype) el.inert = false;
        else el.removeAttribute('aria-hidden');
      }
    });
  }

  function openBookingModal() {
    if (!bookingOverlay) return;
    bookingLastFocused = document.activeElement;
    const title = document.getElementById('bm-sum-title');
    const meta  = document.getElementById('bm-sum-meta');
    if (title) title.textContent = 'Forhandlingsteknik';
    if (meta)  meta.textContent  = (sumDate ? sumDate.textContent : '') + ' · ' + (sumLoc ? sumLoc.textContent : '');
    bookingOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    bmSetChromeInert(true);
    // Move focus into the modal — close button first, falling back to name field.
    const closeBtn = document.getElementById('bm-close');
    const nameField = document.getElementById('bm-name');
    setTimeout(function() { (closeBtn || nameField || bookingOverlay).focus(); }, 50);
  }

  function closeBookingModal() {
    if (!bookingOverlay) return;
    bookingOverlay.hidden = true;
    document.body.style.overflow = '';
    bmSetChromeInert(false);
    if (bookingLastFocused && typeof bookingLastFocused.focus === 'function') bookingLastFocused.focus();
    bookingLastFocused = null;
  }

  if (bookingCta) bookingCta.addEventListener('click', openBookingModal);

  if (bookingOverlay) {
    bookingOverlay.addEventListener('click', function(e) {
      if (e.target === bookingOverlay) closeBookingModal();
    });

    document.getElementById('bm-close').addEventListener('click', closeBookingModal);

    document.querySelectorAll('.bm-close-success').forEach(function(btn) {
      btn.addEventListener('click', closeBookingModal);
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !bookingOverlay.hidden) closeBookingModal();
    });

    // Trap Tab / Shift+Tab within the visible modal step.
    bookingOverlay.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab' || bookingOverlay.hidden) return;
      const f = bmFocusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });

    document.getElementById('bm-submit').addEventListener('click', function() {
      const nameEl  = document.getElementById('bm-name');
      const emailEl = document.getElementById('bm-email');
      const name  = nameEl.value.trim();
      const email = emailEl.value.trim();

      nameEl.style.borderColor  = '';
      emailEl.style.borderColor = '';

      if (!name) { nameEl.style.borderColor = '#e53e3e'; nameEl.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { emailEl.style.borderColor = '#e53e3e'; emailEl.focus(); return; }

      const btn = document.getElementById('bm-submit');
      btn.disabled = true;
      btn.textContent = 'Sender…';

      const payEl = document.querySelector('input[name="payment"]:checked');
      fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id:        selectedSessionId,
          customer_name:     name,
          customer_email:    email,
          customer_company:  document.getElementById('bm-company')?.value.trim() || '',
          customer_phone:    document.getElementById('bm-phone')?.value.trim() || '',
          participants:      parseInt(document.getElementById('bm-participants')?.value, 10) || 1,
          payment_method:    payEl ? payEl.value : 'faktura'
        })
      })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
      .then(function(res) {
        if (!res.ok || !res.d.id) throw new Error(res.d.error || 'Booking fejlede');
        document.getElementById('bm-confirm-email').textContent = email;
        document.getElementById('bm-ref-num').textContent = 'FM-' + String(res.d.id).padStart(4, '0');
        document.getElementById('bm-form-step').hidden = true;
        document.getElementById('bm-success-step').hidden = false;
      })
      .catch(function() {
        btn.disabled = false;
        btn.innerHTML = 'Reservér plads <span class="arrow">→</span>';
        alert('Der opstod en fejl. Prøv igen eller ring til os på 77 300 123.');
      });
    });
  }

  /* ============================================================
     CURRICULUM accordion + rail fill
     ============================================================ */
  const phases = document.querySelectorAll('[data-phase]');
  phases.forEach(p => {
    p.querySelector('.phase-head').addEventListener('click', () => {
      const isActive = p.classList.contains('active');
      phases.forEach(x => x.classList.remove('active'));
      if (!isActive) p.classList.add('active');
    });
  });

  const rail = document.getElementById('rail-fill');
  const timeline = document.getElementById('timeline');
  if (rail && timeline && !reduce) {
    let raf2;
    window.addEventListener('scroll', () => {
      if (raf2) return;
      raf2 = requestAnimationFrame(() => {
        const r = timeline.getBoundingClientRect();
        const vh = window.innerHeight;
        const prog = (vh * 0.55 - r.top) / (r.height);
        const clamped = Math.max(0, Math.min(1, prog));
        rail.style.height = (clamped * 100) + '%';
        raf2 = null;
      });
    }, { passive: true });
  } else if (rail && reduce) {
    rail.style.height = '100%';
  }

  /* ============================================================
     MATERIALS
     ============================================================ */
  const BOOKS = [
    { t: '"Guuud, har vi møde i dag…?"', a: 'Therese Waltersdorff', c: '#2C2819' },
    { t: 'Lav skarpere onlinemøder & webinarer', a: 'Arbejdshæfte', c: '#1F3A2E' },
    { t: 'Pixibog i onlinemøder', a: 'Quick guide', c: 'var(--accent-deep)' },
    { t: 'Sådan styrker du dit netværk', a: 'Arbejdshæfte', c: '#3A2C19' },
    { t: 'Personlig branding — din genvej til succes', a: 'Therese Waltersdorff', c: '#21281F' },
    { t: 'Idé til handling — 5 simple trin', a: 'Quick guide', c: '#2C1F28' }
  ];
  const mat = document.getElementById('materials');
  if (mat) {
    BOOKS.forEach(b => {
      const el = document.createElement('div');
      el.className = 'book';
      el.innerHTML = `
        <div class="book-cover" style="background:${b.c}"><div class="bt">${b.t}</div></div>
        <div class="book-meta"><span class="ba">${b.a}</span></div>`;
      mat.appendChild(el);
    });
  }

  /* ============================================================
     RELATED COURSES (retention / cross-sell)
     ============================================================ */
  const RELATED = [
    { cat: 'Kommunikation', t: 'Præsentationsteknik', sup: 'Competence Way', rating: '4,9', dur: '1 dag', price: '6.900', c: '#2C2819' },
    { cat: 'Ledelse', t: 'Konflikthåndtering', sup: 'Competence Way', rating: '4,7', dur: '1 dag', price: '6.500', c: '#1F3A2E' },
    { cat: 'Personlig udvikling', t: 'Personlig gennemslagskraft', sup: 'Waltersdorff Consulting', rating: '4,8', dur: '2 dage', price: '9.900', c: '#3A2C19' },
    { cat: 'Salg', t: 'Salgspsykologi & indvendinger', sup: 'Competence Way', rating: '4,8', dur: '1 dag', price: '7.200', c: '#21281F' }
  ];
  const rel = document.getElementById('related-grid');
  if (rel) {
    RELATED.forEach(r => {
      const a = document.createElement('a');
      a.className = 'rc-card';
      a.href = '#';
      a.innerHTML = `
        <div class="rc-top" style="background:${r.c}">
          <span class="rc-cat">${r.cat}</span>
          <span class="rc-rating"><span class="rc-star">★</span> ${r.rating}</span>
          <span class="rc-go" aria-hidden="true">→</span>
        </div>
        <div class="rc-body">
          <h3 class="rc-title">${r.t}</h3>
          <div class="rc-supplier">${r.sup}</div>
          <div class="rc-foot">
            <span class="rc-dur">${r.dur}</span>
            <span class="rc-price">kr. ${r.price}<small> ekskl. moms</small></span>
          </div>
        </div>`;
      rel.appendChild(a);
    });
  }

  /* ============================================================
     COURSE TYPE PRESETS
     ============================================================ */
  const PRESETS = {
    ledelse: {
      accent: ['#FF5A1F','#D8410C','#1A0E04'],
      chip: 'Ledelse & Kommunikation',
      heroTag: '1 dag · 09–16',
      priceLabel: 'Pris ekskl. moms',
      price: 'kr. 6.900<small>,-</small>',
      priceNote: 'Materialer, forplejning & kursusbevis inkluderet',
      ctaText: 'Vælg dato', bookingCta: 'Reservér plads',
      facts: [
        {k:'Varighed', v:'1 dag', s:'/ 09–16'},
        {k:'Niveau', v:'Alle', s:'/ ingen forudsætninger'},
        {k:'Format', v:'Fysisk', s:'/ + online hold'},
        {k:'Deltagere', v:'Maks 14', s:'/ pr. hold'}
      ],
      outcomesHeadline: 'Tre færdigheder du tager med hjem — og bruger i morgen.',
      outcomes: ['Lær at skabe win-win-forhandlingsresultater, hvor begge parter rejser sig tilfredse.','Udvid dit forhandlingsrum og bliv skarp til at identificere det gode kompromis.','Mestr selvindsigt, kontrol og effektiv kommunikation — også når følelserne stiger.'],
      curriculumHeadline: 'En forhandling i tre akter',
      curriculumLead: 'Vi følger forhandlingen fra forberedelse til evaluering. Klik på en fase for at folde indholdet ud.',
      phases: [
        {tag:'Akt 1', label:'Før', items:['Win-win eller "pistolsalg"?','Udvid forhandlingsrummet','Hvad jeg SKAL have — og hvad der bare er RART at have','Interessentanalyse & beføjelser','Værdifastsættelse og prioritering','Konjunkturer, marked og aftaleperiode']},
        {tag:'Akt 2', label:'Under', items:['Tag kontrollen ved bordet','Intet er aftalt, før alt er aftalt','Lyt — og hør hvad der ikke bliver sagt','Håndtering af følelser og selvindsigt','Pokerface i praksis']},
        {tag:'Akt 3', label:'Efter', items:['Evaluering af resultatet','Hvad tager du med til næste forhandling?']}
      ],
      included: ['Kursusbevis','Forplejning hele dagen','Alle kursusmaterialer','Maks 14 deltagere'],
      certBlock:false, amuBlock:false, bringBlock:false
    },
    it: {
      accent: ['#3A6FF8','#1E4FD8','#FFFFFF'],
      chip: 'IT & Data',
      heroTag: '2 dage · 09–16',
      priceLabel: 'Pris ekskl. moms',
      price: 'kr. 8.900<small>,-</small>',
      priceNote: 'Digitale materialer & kursusbevis inkluderet',
      ctaText: 'Vælg dato', bookingCta: 'Reservér plads',
      facts: [
        {k:'Varighed', v:'2 dage', s:'/ 09–16'},
        {k:'Niveau', v:'Øvet', s:'/ kendskab til Excel'},
        {k:'Format', v:'Fysisk', s:'/ + online hold'},
        {k:'Deltagere', v:'Maks 12', s:'/ pr. hold'}
      ],
      outcomesHeadline: 'Tre kompetencer du tager direkte i brug på dit næste regneark.',
      outcomes: ['Behersk avancerede formler og opslagsfunktioner som XOPSLAG og dynamiske arrays.','Byg professionelle pivottabeller og dashboards der opdaterer sig automatisk.','Automatiser gentagne opgaver med Power Query og grundlæggende makroer.'],
      curriculumHeadline: 'Fire moduler — to intensive dage',
      curriculumLead: 'Fra datastruktur til automatisering. Hvert modul afsluttes med praktiske øvelser på egne data.',
      phases: [
        {tag:'Dag 1', label:'Datastruktur & formler', items:['Effektiv tabelstruktur og navngivne intervaller','Betingede formler: HVIS, OG, ELLER','XOPSLAG og INDEX/MATCH','Dynamiske arrays og spild-formler']},
        {tag:'Dag 1', label:'Analyse & visualisering', items:['Pivottabeller fra bunden','Betinget formatering','Avancerede diagrammer og sparklines','Datavalidering og fejlhåndtering']},
        {tag:'Dag 2', label:'Automatisering', items:['Introduktion til makroer og VBA','Power Query — importer og transformer data','Automatiske rapporter og dataopdatering']},
        {tag:'Dag 2', label:'Dashboards & aflevering', items:['Byg et live-dashboard','Del og sikr dine Excel-filer','Kursusopsamling og individuelle spørgsmål']}
      ],
      included: ['Kursusbevis','Digitale øvelsesfiler','Online adgang i 12 mdr.','Maks 12 deltagere'],
      certBlock:false, amuBlock:false, bringBlock:false
    },
    cert: {
      accent: ['#6B4DE0','#4B30C0','#FFFFFF'],
      chip: 'Certificering',
      heroTag: '3 dage + eksamen',
      priceLabel: 'Kursus & eksamen ekskl. moms',
      price: 'kr. 14.900<small>,-</small>',
      priceNote: 'Officiel PRINCE2® Foundation-eksamen inkluderet',
      ctaText: 'Book kursus & eksamen', bookingCta: 'Book kursus & eksamen',
      facts: [
        {k:'Varighed', v:'3 dage', s:'+ eksamen dag 4'},
        {k:'Beståelsespct.', v:'92%', s:'/ på dette hold'},
        {k:'Bevis', v:'PRINCE2®', s:'/ internationalt anerkendt'},
        {k:'Deltagere', v:'Maks 12', s:'/ pr. hold'}
      ],
      outcomesHeadline: 'Bestå eksamen. Få et internationalt anerkendt certifikat.',
      outcomes: ['Forstå og anvend PRINCE2® principperne i virkelige projekter fra dag ét.','Bestå den officielle Foundation-eksamen — eksamensgebyr er inkluderet i prisen.','Tilføj PRINCE2® Foundation til dit CV og LinkedIn med et digitalt verifikationslink.'],
      curriculumHeadline: 'Tre dages intensiv eksamenforberedelse',
      curriculumLead: 'Hele PRINCE2® Foundation-pensum. Øvelseseksamener hver dag. Klar til officiel eksamen på dag 4.',
      phases: [
        {tag:'Dag 1', label:'Grundprincipper', items:['PRINCE2® principper og temaer','Projektmiljø og projekt-definition','Business case og organisation','Kvalitet og planlægning']},
        {tag:'Dag 2', label:'Processer & styring', items:['Styring af et projektforløb','Risici og ændringer','Fremdrift og milepæle','Øvelseseksamener med gennemgang']},
        {tag:'Dag 3', label:'Eksamenforberedelse', items:['Fuld mock-eksamen','Gennemgang af hyppige fejltyper','Eksamensteknik og tidsstyring','Åben Q&A med instruktør']}
      ],
      included: ['PRINCE2® Foundation eksamen','Officielt studiemateriale','Eksamensgebyr inkluderet','Digitalt certifikat'],
      certBlock:true,
      certData:{abbr:'P2',name:'PRINCE2®<br>Foundation',body:'Axelos / PeopleCert',passRate:'92%',format:'60 min. multiple choice',validity:'Livstid'},
      amuBlock:false, bringBlock:false
    },
    sundhed: {
      accent: ['#2F8F63','#1E6344','#F3EEE2'],
      chip: 'Sundhed & Omsorg',
      heroTag: '1 dag · 08–15',
      priceLabel: 'Pris ekskl. moms',
      price: 'kr. 3.200<small>,-</small>',
      priceNote: 'Dansk Førstehjælpsråd-bevis inkluderet',
      ctaText: 'Vælg dato', bookingCta: 'Reservér plads',
      facts: [
        {k:'Varighed', v:'1 dag', s:'/ 08–15'},
        {k:'Bevis', v:'DFR-anerkendt', s:'/ gyldigt 2 år'},
        {k:'Format', v:'Fysisk', s:'/ praktisk øvelse'},
        {k:'Deltagere', v:'Maks 10', s:'/ pr. instruktør'}
      ],
      outcomesHeadline: 'Tre livreddende færdigheder du tager med fra kurset.',
      outcomes: ['Håndter hjertestop korrekt: HLR og brug af hjertestarter (AED) på voksne og børn.','Reagér rigtigt på kvælning, blødninger, forbrændinger og akutte ulykker.','Modtag et DFR-anerkendt bevis gyldigt i 2 år — anerkendt af alle arbejdsgivere.'],
      curriculumHeadline: 'Hvad du lærer på dagen',
      curriculumLead: 'Praktisk fokus. Alle teknikker øves mindst tre gange — du forlader ikke kurset uden at have prøvet det i virkeligheden.',
      phases: [
        {tag:'Formiddag', label:'Grundlæggende', items:['Vurdering af situation og sikkerhed','Bevidstløshed og stabil sideleje','HLR — voksne og børn','Brug af hjertestarter (AED)']},
        {tag:'Eftermiddag', label:'Akutsituationer', items:['Kvælning og Heimlich-manøvren','Blødninger og sårbehandling','Forbrændinger og el-ulykker','Chok, besvimelse og kramper']},
        {tag:'Afslutning', label:'Evaluering & bevis', items:['Praktisk prøve','Udstedelse af DFR-anerkendt bevis','Genopfriskning og Q&A']}
      ],
      included: ['DFR-anerkendt kursusbevis','Forplejning hele dagen','Praktisk øvelsesudstyr','Gyldig 2 år fra kursusdag'],
      certBlock:false, amuBlock:false, bringBlock:true,
      bringItems:[
        {ico:'👟',t:'Behageligt tøj',s:'Du kommer til at ligge på gulvet og øve dig fysisk — undgå stramme eller dyre klæder.'},
        {ico:'💧',t:'Vandflaske',s:'Kurset er fysisk aktivt. Medbring vand til dig selv.'},
        {ico:'🩺',t:'Særlige behov?',s:'Har du fysiske begrænsninger? Giv besked ved tilmelding, så tilpasser vi øvelserne.'}
      ]
    },
    amu: {
      accent: ['#C7553A','#9C3C24','#FBF3EB'],
      chip: 'AMU-kursus',
      heroTag: '5 dage · AMU-finansieret',
      priceLabel: 'AMU-finansieret',
      price: 'fra kr. 0<small>,-*</small>',
      priceNote: '* Gratis for berettigede lønmodtagere og ledige via AMU-ordningen',
      ctaText: 'Tilmeld dig', bookingCta: 'Tilmeld dig kurset',
      facts: [
        {k:'Varighed', v:'5 dage', s:'/ 07:30–15:30'},
        {k:'AMU-niveau', v:'Niveau 2', s:'/ 2 ugers anciennitet'},
        {k:'Bevis', v:'AMU-bevis', s:'/ officielt kompetencebevis'},
        {k:'Finansiering', v:'Gratis*', s:'/ for berettigede'}
      ],
      outcomesHeadline: 'Tre arbejdsmarkedsrelevante kompetencer du tager med.',
      outcomes: ['Udfør arbejdet sikkert og korrekt efter gældende regler — og dokumentér det rigtigt.','Betjen og opsæt udstyr selvstændigt med korrekte målemetoder og tolerancer.','Modtag et officielt AMU-kompetencebevis anerkendt på hele det danske arbejdsmarked.'],
      curriculumHeadline: 'Fem dage — teori og praktik i vekselvirkning',
      curriculumLead: 'Hvert dag afsluttes med en opsamling. Dag 5 er prøvedag med udstedelse af kompetencebevis.',
      phases: [
        {tag:'Dag 1–2', label:'Teori & regler', items:['Gældende regler og lovgivning','Sikkerhedsforskrifter og APV','Materialekundskab og materialevalg','Beregninger og tegningsforståelse']},
        {tag:'Dag 3–4', label:'Praktiske øvelser', items:['Opstilling og betjening af udstyr','Målemetoder og tolerancer','Fejlfinding og korrektioner','Dokumentation og rapportering']},
        {tag:'Dag 5', label:'Prøve & kompetencebevis', items:['Praktisk prøve','Teoriprøve','Evaluering og feedback','Udstedelse af AMU-kompetencebevis']}
      ],
      included: ['Officielt AMU-kompetencebevis','Sikkerhedsudstyr udleveres','Forplejning alle 5 dage','VEU-godtgørelse kan søges'],
      certBlock:false, amuBlock:true, bringBlock:true,
      bringItems:[
        {ico:'🦺',t:'Arbejdstøj',s:'Medbring eget arbejdstøj eller overalls. Sikkerhedssko påkrævet — kan lånes mod depositum.'},
        {ico:'📋',t:'NemID / MitID',s:'Tilmelding til AMU-kurser kræver identifikation via MitID.'},
        {ico:'📄',t:'Dokumentation for anciennitet',s:'2 ugers anciennitet skal dokumenteres. Kontakt os, hvis du er i tvivl.'},
        {ico:'🍱',t:'Madpakke (valgfrit)',s:'Frokost er inkluderet, men du er velkommen til at medbringe ekstra snacks.'}
      ]
    }
  };

  function txt(id, html) { var e = document.getElementById(id); if (e) e.innerHTML = html; }
  function show(id, v) { var e = document.getElementById(id); if (e) { if (v) e.removeAttribute('hidden'); else e.setAttribute('hidden',''); } }

  function renderTimeline(phases) {
    var tl = document.getElementById('timeline');
    if (!tl) return;
    tl.innerHTML = '<div class="timeline-rail"><div class="fill" id="rail-fill"></div></div>';
    phases.forEach(function(ph, i) {
      var div = document.createElement('div');
      div.className = 'phase' + (i === 0 ? ' active' : '') + ' reveal';
      div.setAttribute('data-phase','');
      div.innerHTML =
        '<div class="phase-dot"></div>' +
        '<div class="phase-head">' +
          '<span class="phase-tag">' + ph.tag + '</span>' +
          '<span class="phase-label">' + ph.label + '</span>' +
          '<span class="phase-toggle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>' +
        '</div>' +
        '<div class="phase-items">' +
          ph.items.map(function(item){ return '<div class="phase-item"><span class="pmark">→</span>' + item + '</div>'; }).join('') +
        '</div>';
      tl.appendChild(div);
    });
    tl.querySelectorAll('[data-phase]').forEach(function(p) {
      p.querySelector('.phase-head').addEventListener('click', function() {
        var isActive = p.classList.contains('active');
        tl.querySelectorAll('[data-phase]').forEach(function(x){ x.classList.remove('active'); });
        if (!isActive) p.classList.add('active');
      });
    });
  }

  function renderBring(items) {
    var el = document.getElementById('bring-items');
    if (!el || !items) return;
    el.innerHTML = items.map(function(b) {
      return '<div class="bring-item">' +
        '<div class="bring-ico">' + b.ico + '</div>' +
        '<div><div class="bring-t">' + b.t + '</div><div class="bring-s">' + b.s + '</div></div>' +
        '</div>';
    }).join('');
  }

  function updateIncluded(items) {
    var ul = document.getElementById('bs-included-list');
    if (!ul) return;
    ul.innerHTML = items.map(function(i){ return '<li>' + i + '</li>'; }).join('');
  }

  window.setCoursePreset = function(key) {
    var p = PRESETS[key]; if (!p) return;
    document.documentElement.style.setProperty('--accent', p.accent[0]);
    document.documentElement.style.setProperty('--accent-deep', p.accent[1]);
    document.documentElement.style.setProperty('--on-accent', p.accent[2]);
    txt('course-chip', '<span class="dot"></span>' + p.chip);
    txt('hero-tag-text', p.heroTag);
    txt('course-price-label', p.priceLabel);
    txt('course-price', p.price);
    txt('course-price-note', p.priceNote);
    txt('course-cta-text', p.ctaText);
    txt('booking-cta-text', p.bookingCta);
    p.facts.forEach(function(f,i){ var e=document.getElementById('fact-'+i); if(e) e.innerHTML='<div class="k">'+f.k+'</div><div class="v">'+f.v+' <small>'+f.s+'</small></div>'; });
    txt('outcomes-headline', p.outcomesHeadline);
    txt('outcome-1', p.outcomes[0]);
    txt('outcome-2', p.outcomes[1]);
    txt('outcome-3', p.outcomes[2]);
    txt('curriculum-headline', p.curriculumHeadline);
    txt('curriculum-lead', p.curriculumLead);
    renderTimeline(p.phases);
    updateIncluded(p.included);
    show('cert-block', p.certBlock);
    show('amu-block', p.amuBlock);
    show('bring-block', p.bringBlock);
    if (p.certData) {
      txt('cert-abbr', p.certData.abbr);
      txt('cert-name', p.certData.name);
      txt('cert-body', p.certData.body);
      txt('cert-pass-rate', p.certData.passRate);
      txt('cert-format', p.certData.format);
      txt('cert-validity', p.certData.validity);
    }
    if (p.bringItems) renderBring(p.bringItems);
  };

})();
