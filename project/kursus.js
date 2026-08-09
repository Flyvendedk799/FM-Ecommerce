/* ============================================================
   FUTUREMATCH — kursus.js
   Dynamic course page — fetches from API and renders full page
   ============================================================ */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- DOM refs ---- */
  const loading  = document.getElementById('kursus-loading');
  const errorEl  = document.getElementById('kursus-error');
  const errorMsg = document.getElementById('kursus-error-msg');
  const contentEl= document.getElementById('kursus-content');
  const nav      = document.getElementById('nav');
  const stickybar= document.getElementById('stickybar');

  /* ---- State ---- */
  let selectedSession = null;
  let currentCourse   = null;

  /* ---- Month labels ---- */
  const M_ABBR = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  const M_FULL = {Jan:'januar',Feb:'februar',Mar:'marts',Apr:'april',Maj:'maj',Jun:'juni',Jul:'juli',Aug:'august',Sep:'september',Okt:'oktober',Nov:'november',Dec:'december'};

  /* ---- Helpers ---- */
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function safeRichHtml(html) {
    return String(html || '')
      .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
  }
  function safeColor(v){ return /^#[0-9a-fA-F]{3,8}$/.test(String(v||'')) ? v : '#2C1A0A'; }
  function monogram(title){ return window.FMCardMedia ? window.FMCardMedia.monogram(title) : ''; }

  function fmtDateFull(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDate();
    const mon = M_ABBR[d.getMonth()];
    return `${day}. ${M_FULL[mon] || mon} ${d.getFullYear()}`;
  }

  function fmtPrice(price, badge) {
    if (badge === 'amu' || price === 0) return 'Gratis*';
    return 'kr. ' + (+price).toLocaleString('da-DK') + ',-';
  }

  function priceMarkup(price, badge) {
    if (badge === 'amu' || Number(price || 0) === 0) return 'Gratis*';
    return (+price).toLocaleString('da-DK') + '<small> kr.</small>';
  }

  function todayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function sessionSeatsRemaining(s) {
    const seats = s && s.seats_remaining != null ? s.seats_remaining : (s ? s.seats : null);
    return seats == null ? null : Number(seats);
  }

  function hasSeat(s) {
    const seats = sessionSeatsRemaining(s);
    return seats == null || seats > 0;
  }

  function showError(msg) {
    loading.hidden = true;
    if (msg) errorMsg.textContent = msg;
    errorEl.hidden = false;
  }

  /* ---- Nav scroll ---- */
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
    const show = window.scrollY > 620 && (window.scrollY + window.innerHeight) < (document.body.scrollHeight - 480);
    stickybar.classList.toggle('show', show);
  }, { passive: true });

  /* ---- Smooth scroll ---- */
  function bindScrollBtns() {
    document.querySelectorAll('[data-scroll]').forEach(b => {
      if (b.id === 'sb-cta') return;
      b.addEventListener('click', () => {
        const t = document.querySelector(b.dataset.scroll);
        if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }

  /* ---- Reveals ---- */
  function initReveals() {
    const revs = document.querySelectorAll('.reveal');
    if (reduce) { revs.forEach(r => r.classList.add('is-in')); return; }
    function check() {
      revs.forEach(r => {
        if (!r.classList.contains('is-in') && r.getBoundingClientRect().top < window.innerHeight * .91)
          r.classList.add('is-in');
      });
    }
    check();
    let raf;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { check(); raf = null; });
    }, { passive: true });
    setTimeout(() => revs.forEach(r => r.classList.add('is-in')), 1400);
  }

  /* ============================================================
     FETCH
  ============================================================ */
  const params   = new URLSearchParams(location.search);
  const courseId = params.get('id');

  if (!courseId) { showError('Intet kursus angivet. Gå til kursoversigten for at vælge et kursus.'); }
  else init();

  async function init() {
    try {
      const [course, sessions, reviews] = await Promise.all([
        fetch('/api/courses/' + courseId).then(r => { if (!r.ok) throw new Error('Kurset findes ikke'); return r.json(); }),
        fetch('/api/sessions?course_id=' + courseId).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/reviews?course_id=' + courseId).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);

      // Fetch up to 4 related courses from same category
      let related = [];
      if (course.category_key) {
        related = await fetch('/api/courses?category=' + encodeURIComponent(course.category_key))
          .then(r => r.json())
          .then(arr => arr.filter(c => c.id !== course.id).slice(0, 4))
          .catch(() => []);
      }

      currentCourse = course;
      renderPage(course, sessions, related, Array.isArray(reviews) ? reviews : []);
    } catch (e) {
      showError(e.message || 'Kurset kunne ikke hentes.');
    }
  }

  /* ============================================================
     PAGE RENDER
  ============================================================ */
  function renderPage(course, sessions, related, reviews) {
    // Set title and accent
    document.title = course.title + ' — Futurematch';
    document.querySelector('meta[name="description"]')?.setAttribute('content', course.short_description || '');

    const accent     = /^#[0-9a-fA-F]{3,8}$/.test(String(course.category_accent || '')) ? course.category_accent : '#FF5A1F';
    const accentDeep = shadeColor(accent, -0.15);
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-deep', accentDeep);

    const outcomes = Array.isArray(course.outcomes) ? course.outcomes : [];
    const included = Array.isArray(course.included) ? course.included : [];
    const facts    = Array.isArray(course.facts)    ? course.facts    : [];
    const marquee  = Array.isArray(course.marquee_items) ? course.marquee_items : [course.title];
    const phases   = Array.isArray(course.curriculum)    ? course.curriculum    : [];
    const badge    = course.badge || '';

    // Group upcoming sessions by location. Sold-out sessions remain visible so
    // users understand there were dates, but they cannot be selected.
    const byLoc = {};
    const today = todayISO();
    (sessions || []).filter(s => s.status === 'active' && !s.is_expired && (!s.date || s.date >= today)).forEach(s => {
      const key = s.is_online ? 'online' : s.location;
      if (!byLoc[key]) byLoc[key] = [];
      byLoc[key].push(s);
    });
    const locOrder = ['København', 'Aarhus', 'Odense', 'Aalborg', 'online'];
    const locKeys = Object.keys(byLoc).sort((a, b) => {
      const ai = locOrder.indexOf(a), bi = locOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b, 'da');
    });
    const hasBookableSessions = locKeys.some(k => (byLoc[k] || []).some(hasSeat));

    // Build HTML
    contentEl.innerHTML = buildPageHTML(course, outcomes, included, facts, marquee, phases, badge, locKeys, byLoc, related, reviews || []);

    // Show content
    loading.hidden = true;
    contentEl.hidden = false;

    // Init sticky bar
    document.getElementById('sb-title').textContent = course.title;
    document.getElementById('sb-price').textContent = fmtPrice(course.price, badge) + ' ekskl. moms';
    document.getElementById('sb-sub').textContent = hasBookableSessions ? 'Vælg dato og lokation' : 'Få besked om nye datoer';
    document.getElementById('sb-cta').textContent = hasBookableSessions ? 'Læg i kurv' : 'Få besked';
    if (course.rating) {
      document.getElementById('sb-rating').hidden = false;
      document.getElementById('sb-rating-val').textContent = (+course.rating).toFixed(1);
    }

    // Init interactions
    initReveals();
    bindScrollBtns();
    initSessionPicker(byLoc, locKeys, course);
    initDescription();
    initCurriculum();
    initCartActions(course);
    initBookingModal(course);
    initGallery(course);
    if (window.FMCardMedia) window.FMCardMedia.enhance(contentEl);
    initParallax();
    initRailFill();
    initNotify(course);

    // Breadcrumb back link
    const bcBack = document.getElementById('breadcrumb-back');
    if (bcBack) bcBack.addEventListener('click', e => { e.preventDefault(); history.back(); });
  }

  /* ============================================================
     GALLERY
     Suppliers ship anything from one logo to a full photo set. The API
     returns the whole gallery in `images` and still fills it from the
     legacy single `image_src` for rows imported before galleries existed,
     so this only has to normalise the shape.
  ============================================================ */
  function galleryImages(course) {
    const raw = Array.isArray(course.images) ? course.images : [];
    const seen = {};
    const out = [];
    raw.forEach(entry => {
      const item = typeof entry === 'string' ? { src: entry } : (entry || {});
      const src = String(item.src || '').trim();
      if (!src || seen[src]) return;
      seen[src] = true;
      out.push({ src, alt: String(item.alt || '').trim() });
    });
    if (!out.length && course.image_src) {
      out.push({ src: course.image_src, alt: course.image_alt_text || '' });
    }
    return out;
  }

  function galleryHTML(course) {
    const images = galleryImages(course);
    // No artwork at all is fine now: the booking card below carries the
    // column on its own, so an empty placeholder frame would be noise.
    if (!images.length) return '';

    const first = images[0];
    const multi = images.length > 1;
    const thumbs = multi ? `
      <div class="gallery-thumbs" role="tablist" aria-label="Kursusbilleder">
        ${images.map((img, i) => `
        <button type="button" class="gallery-thumb${i === 0 ? ' is-active' : ''}" role="tab"
                aria-selected="${i === 0 ? 'true' : 'false'}" aria-label="Billede ${i + 1} af ${images.length}" data-gallery-index="${i}">
          <img src="${esc(img.src)}" alt="" loading="lazy">
        </button>`).join('')}
      </div>` : '';

    return `
      <div class="gallery" id="course-gallery">
        <div class="hero-media${multi ? ' has-thumbs' : ''}">
          <img class="hero-media-backdrop" id="gallery-backdrop" src="${esc(first.src)}" alt="" aria-hidden="true">
          <button type="button" class="gallery-stage" id="gallery-stage" aria-label="Åbn billedet i fuld størrelse">
            <img class="hero-course-img" id="gallery-main" src="${esc(first.src)}"
                 alt="${esc(first.alt || course.image_alt_text || course.title)}" loading="eager"
                 onerror="this.closest('.hero-media').classList.add('img-failed')">
            <span class="gallery-zoom" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>
            </span>
          </button>
          ${multi ? `
          <button type="button" class="gallery-nav prev" data-gallery-step="-1" aria-label="Forrige billede">‹</button>
          <button type="button" class="gallery-nav next" data-gallery-step="1" aria-label="Næste billede">›</button>
          <div class="gallery-count" id="gallery-count" aria-hidden="true">1 / ${images.length}</div>` : ''}
        </div>
        ${thumbs}
      </div>`;
  }

  /* ============================================================
     HERO BOOKING CARD
     A course page has one job on arrival: say what this is, what it
     costs, when you can go and how to book — without scrolling. The
     card carries price, next date and CTA, which also means the hero's
     second column stands on its own content instead of depending on
     whatever artwork the supplier happened to upload.
  ============================================================ */
  function fmtDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const stamp = `${d.getDate()}. ${(M_ABBR[d.getMonth()] || '').toLowerCase()}.`;
    return d.getFullYear() === new Date().getFullYear() ? stamp : `${stamp} ${d.getFullYear()}`;
  }

  const ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>';

  function heroAvailabilityHTML(next) {
    if (!next) {
      return `<div class="bc-next muted">${ICON_CAL}
        <div><b>Ingen faste datoer lige nu</b><span>Vi sætter gerne et firmahold op til jer</span></div>
      </div>`;
    }
    const seats = sessionSeatsRemaining(next);
    const where = next.is_online ? 'Online' : (next.location || '');
    const scarce = seats != null && seats <= 4
      ? ` · <span class="bc-scarce">${Math.max(0, seats)} pladser tilbage</span>`
      : '';
    return `<div class="bc-next">${ICON_CAL}
      <div><b>Næste hold ${esc(fmtDateShort(next.date))}</b><span>${esc(where)}${scarce}</span></div>
    </div>`;
  }

  // Where a course actually runs is a first question for a buyer, and until
  // now it only appeared far down the page in the date picker.
  function heroWhereHTML(locKeys, dateCount) {
    if (!locKeys.length) return '';
    const cities = locKeys.map(k => `<span class="hw-city">${esc(k === 'online' ? 'Online' : k)}</span>`).join('');
    return `
      <div class="hero-where">
        <span class="hw-label">Afholdes i</span>
        <div class="hw-cities">${cities}</div>
        <span class="hw-count">${dateCount} ${dateCount === 1 ? 'kommende dato' : 'kommende datoer'}</span>
      </div>`;
  }

  /* The strongest thing to put under the course's summary is what the buyer
     actually gets. Outcomes are the better copy, but CSV-imported courses
     have none, so the price's inclusions stand in — those the importer always
     fills. Both appear again further down the page in full; this is the
     summary a visitor reads before deciding to scroll at all. */
  function heroHighlightsHTML(outcomes, included) {
    const useOutcomes = outcomes.length > 0;
    const items = (useOutcomes ? outcomes : included).slice(0, 3);
    if (!items.length) return '';
    return `
      <div class="hero-highlights">
        <span class="hh-label">${useOutcomes ? 'Det lærer du' : 'Inkluderet i prisen'}</span>
        <ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      </div>`;
  }

  function bookingCardHTML(course, badge, next) {
    const free = badge === 'amu' || Number(course.price || 0) === 0;
    const amount = free
      ? 'Gratis<small>*</small>'
      : `kr. ${(+course.price).toLocaleString('da-DK')}<small>,-</small>`;
    const rating = Number(course.rating || 0) > 0
      ? `<span class="bc-rating"><span class="st">★</span>${(+course.rating).toFixed(1).replace('.', ',')}</span>`
      : '';
    return `
      <div class="bcard">
        ${galleryHTML(course)}
        <div class="bcard-body">
          <div class="bc-price-row">
            <div>
              <div class="bc-label">${esc(course.price_label || 'Pris ekskl. moms')}</div>
              <div class="bc-amount">${amount}</div>
            </div>
            ${rating}
          </div>
          ${course.price_note ? `<div class="bc-note">${esc(course.price_note)}</div>` : ''}
          ${heroAvailabilityHTML(next)}
          <button class="btn-book" id="hero-book-btn" data-scroll="#datoer">
            ${next ? 'Vælg dato' : 'Få besked om datoer'} <span class="arrow">→</span>
          </button>
          <ul class="bc-trust">
            <li>Ingen betaling nu — du vælger dato først</li>
            <li>Gratis afbestilling indtil 14 dage før</li>
          </ul>
        </div>
      </div>`;
  }

  /* ============================================================
     HTML BUILDERS
  ============================================================ */
  function buildPageHTML(course, outcomes, included, facts, marquee, phases, badge, locKeys, byLoc, related, reviews) {
    const priceStr  = fmtPrice(course.price, badge);
    const chipLabel = esc(course.category_label || 'Kursus');
    // the soonest date a visitor could actually take, for the hero card
    const upcoming = locKeys
      .reduce((all, k) => all.concat(byLoc[k] || []), [])
      .filter(s => s.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const nextSession = upcoming.find(hasSeat) || upcoming[0] || null;
    const factsHTML = facts.slice(0, 4).map((f, i) => `
      <div class="fact" id="fact-${i}">
        <div class="k">${esc(f.k)}</div>
        <div class="v">${esc(f.v)}${f.s ? ` <small>${esc(f.s)}</small>` : ''}</div>
      </div>`).join('');

    const marqueeItems = [...marquee, ...marquee].map(t => `<span class="marquee-item">${esc(t)}</span>`).join('');
    const notifyHTML = `
  <div class="notify reveal">
    <div class="notify-main">
      <span class="eyebrow">Ikke klar endnu?</span>
      <h3>Få besked, når vi åbner nye datoer</h3>
      <p>Vi sender en kort mail, så snart der kommer nye hold — ingen spam.</p>
    </div>
    <form class="notify-form" id="notify-form">
      <input type="email" class="notify-input" placeholder="Din arbejdsmail" required>
      <button class="notify-btn" type="submit">Hold mig opdateret</button>
    </form>
  </div>`;

    return `
<main id="top">

<!-- ============ BREADCRUMB ============ -->
<div class="wrap" style="padding-top:90px; padding-bottom:0">
  <div style="display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--muted)">
    <a href="Kategorier.html" style="color:var(--muted);text-decoration:none;transition:color .2s" onmouseover="this.style.color='var(--ink)'" onmouseout="this.style.color='var(--muted)'">Alle kurser</a>
    <span style="color:var(--line);font-size:1rem">›</span>
    ${course.category_label ? `<a href="Kategorier.html#${esc(course.category_key||'')}" style="color:var(--muted);text-decoration:none;transition:color .2s" onmouseover="this.style.color='var(--ink)'" onmouseout="this.style.color='var(--muted)'">${esc(course.category_label)}</a><span style="color:var(--line);font-size:1rem">›</span>` : ''}
    <span style="color:var(--ink);font-weight:600">${esc(course.title)}</span>
  </div>
</div>

<!-- ============ HERO ============ -->
<section class="hero wrap">
  <div class="hero-grid">
    <div class="hero-lead reveal is-in">
      <div class="hero-meta-row">
        <span class="chip solid"><span class="dot"></span>${chipLabel}</span>
        <span class="chip">${esc(course.format || 'Fysisk')}</span>
        <span class="chip">Dansk</span>
      </div>
      <h1 class="display">
        <span class="lines">
          <span class="line-mask"><span>${esc(course.title)}</span></span>
        </span>
      </h1>
      <p class="hero-sub">${esc(course.short_description || course.description || '')}</p>
      ${heroWhereHTML(locKeys, upcoming.length)}
      ${heroHighlightsHTML(outcomes, included)}
      <div class="hero-supplier">
        <span class="supplier-logo">${esc(course.supplier_abbr || '?')}</span>
        <span>Udbydes af <b>${esc(course.supplier_name || 'Futurematch')}</b>${course.rating ? ` · ${(+course.rating).toFixed(1)} ★ fra ${(+course.review_count||0).toLocaleString('da-DK')} kursister` : ''}</span>
      </div>
    </div>

    <aside class="hero-aside reveal reveal-d2 is-in">
      ${bookingCardHTML(course, badge, nextSession)}
    </aside>
  </div>

  <!-- Facts strip -->
  <div class="facts reveal" id="facts-grid">
    ${factsHTML || `
    <div class="fact"><div class="k">Varighed</div><div class="v">${esc(course.duration||'—')}</div></div>
    <div class="fact"><div class="k">Format</div><div class="v">${esc(course.format||'Fysisk')}</div></div>
    <div class="fact"><div class="k">Rating</div><div class="v">${course.rating?(+course.rating).toFixed(1)+' ★':'—'}</div></div>
    <div class="fact"><div class="k">Leverandør</div><div class="v">${esc(course.supplier_name||'—')}</div></div>`}
  </div>
</section>

<!-- ============ CERT BLOCK ============ -->
${badge === 'cert' ? `
<section class="section-pad wrap">
  <div class="cert-card reveal">
    <div class="cert-main">
      <span class="eyebrow">Officiel certificering</span>
      <h2 class="display" style="margin-top:18px;font-size:clamp(2.1rem,4vw,3.4rem)">Bestå eksamen.<br><span class="ital">Få dit certifikat.</span></h2>
      <p style="color:var(--muted);margin-top:18px;max-width:46ch;line-height:1.65">Kurset forbereder dig fuldt ud til den officielle eksamen, som er inkluderet i prisen.</p>
      <div class="cert-stats">
        <div class="cstat"><b>92%</b><span>beståelsespct.</span></div>
        <div class="cstat"><b>60 min.</b><span>multiple choice</span></div>
        <div class="cstat"><b>Internationalt</b><span>anerkendt certifikat</span></div>
      </div>
    </div>
    <div class="cert-badge-wrap">
      <div class="cert-badge">
        <div class="cb-logo">${esc((course.title||'').slice(0,2).toUpperCase())}</div>
        <div class="cb-name">${esc(course.title)}</div>
        <div class="cb-tag">Internationalt anerkendt</div>
      </div>
    </div>
  </div>
</section>` : ''}

<!-- ============ AMU BLOCK ============ -->
${badge === 'amu' ? `
<div class="amu-band wrap">
  <div class="amu-inner reveal">
    <div class="amu-logo">AMU</div>
    <div class="amu-body">
      <div class="amu-title">Staten finansierer kurset for berettigede deltagere</div>
      <div class="amu-desc">Lønmodtagere, ledige og selvstændige kan deltage gratis eller mod reduceret betaling via AMU-ordningen.</div>
    </div>
    <a class="amu-cta" href="Kontakt.html?emne=amu">Tjek om du er berettiget <span class="arrow">→</span></a>
  </div>
</div>` : ''}

<!-- ============ MARQUEE ============ -->
<div class="marquee" aria-hidden="true">
  <div class="marquee-track">${marqueeItems}</div>
</div>

<!-- ============ OUTCOMES ============ -->
${outcomes.length > 0 ? `
<section class="section-pad wrap" id="outcomes">
  <div class="outcomes section-pad" style="padding-inline:clamp(28px,5vw,80px)">
    <div class="reveal">
      <span class="eyebrow on-dark">Det får du ud af kurset</span>
      <h2 class="display" style="margin-top:20px;font-size:clamp(2.2rem,4.6vw,3.8rem);max-width:20ch">
        ${outcomes.length >= 3 ? 'Tre' : outcomes.length >= 2 ? 'To' : 'Ét'} kompetencer du tager med hjem — og bruger i morgen.
      </h2>
    </div>
    <div class="outcome-list">
      ${outcomes.slice(0,3).map((o, i) => `
      <div class="outcome reveal${i>0?' reveal-d'+i:''}">
        <div class="num">0${i+1}</div>
        <div class="otext">${esc(o)}</div>
        <div class="oicon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg></div>
      </div>`).join('')}
    </div>
  </div>
</section>` : ''}

<!-- ============ SOCIAL PROOF ============ -->
${proofHTML(course, reviews)}

<!-- ============ SESSION PICKER ============ -->
<section class="section-pad wrap" id="datoer">
  <div class="section-head reveal">
    <div>
      <span class="eyebrow">Datoer &amp; lokationer</span>
      <h2 class="display" style="margin-top:18px">Vælg den dato og by der passer dig</h2>
    </div>
    <p class="lead">Vælg et hold nedenfor for at reservere din plads.</p>
  </div>

  ${locKeys.length === 0 ? `
  <div class="no-dates" style="margin-top:24px">
    <div class="nd-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg></div>
    <div>
      <div class="nd-t">Ingen faste datoer tilgængelige endnu</div>
      <div class="nd-s">Ring til ${esc(course.supplier_name||'os')} for at høre om kommende hold og tilpassede datoer.</div>
      <div class="no-dates-actions">
        <button class="btn-primary compact" id="no-dates-cta">Få besked om nye datoer</button>
        <a class="nd-link" href="Kontakt.html?emne=firmahold">Spørg om firmahold</a>
      </div>
    </div>
  </div>` : `
  <div class="booking-grid">
    <div class="reveal reveal-d1">
      <div class="loc-tabs" id="loc-tabs" role="tablist">
        ${locKeys.map((k, i) => `
        <button class="loc-tab" role="tab" aria-selected="${i===0}" data-loc="${esc(k)}">
          <span class="lpin"></span>${esc(k === 'online' ? 'Online' : k)}
        </button>`).join('')}
      </div>
      <div class="session-list" id="session-list"></div>
    </div>
    <aside class="booking-summary reveal reveal-d2">
      ${course.rating ? `<div class="bs-rating"><span class="bs-stars">★★★★★</span><span><b>${(+course.rating).toFixed(1).replace('.',',')}</b>/5 · ${(+course.review_count||0).toLocaleString('da-DK')} anmeldelser</span></div>` : ''}
      <div class="bs-row"><span class="bk">Kursus</span><span class="bv">${esc(course.title)}</span></div>
      <div class="bs-row"><span class="bk">Lokation</span><span class="bv" id="sum-loc">—</span></div>
      <div class="bs-row"><span class="bk">Dato</span><span class="bv" id="sum-date">—</span></div>
      <div class="bs-row"><span class="bk">Format</span><span class="bv" id="sum-format">—</span></div>
      <div class="bs-total">
        <span class="tlabel">I alt<small>ekskl. moms</small></span>
        <span class="tval">${badge==='amu'||!course.price?'Gratis*':(+course.price).toLocaleString('da-DK')+'<small> kr.</small>'}</span>
      </div>
      <div class="bs-scarcity" id="sum-scarcity" hidden></div>
      <button class="btn-primary" id="add-cart-cta">Læg i kurv <span class="arrow">→</span></button>
      <button class="btn-book" id="direct-booking-cta" style="width:100%;justify-content:center;border-radius:100px;background:transparent;border:1.5px solid var(--line);color:var(--ink);margin-top:10px">Reservér direkte</button>
      <div class="bs-microcopy">Checkout uden betaling — vi bekræfter inden for 24 timer</div>
      <ul class="bs-included">
        ${included.map(i => `<li>${esc(i)}</li>`).join('') || '<li>Kursusbevis inkluderet</li>'}
      </ul>
      <div class="bs-guarantee">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>
        Gratis afbestilling indtil 14 dage før
      </div>
      <div class="bs-payment">
        <span class="bp-label">Betal med</span>
        <span class="pay-badge">Faktura</span>
        <span class="pay-badge">EAN</span>
        <span class="pay-badge">Kort</span>
        <span class="pay-badge">MobilePay</span>
      </div>
    </aside>
  </div>`}
</section>

<!-- ============ SUPPLIER DESCRIPTION (below dates so booking stays in reach) ============ -->
${descriptionHTML(course)}

<!-- ============ CURRICULUM ============ -->
${phases.length > 0 ? `
<section class="section-pad wrap" id="indhold">
  <div class="curriculum section-pad" style="padding-inline:clamp(28px,5vw,80px)">
    <div class="section-head reveal" style="margin-bottom:30px">
      <div>
        <span class="eyebrow">Kursusindhold</span>
        <h2 class="display" style="margin-top:18px">${esc(course.title)}</h2>
      </div>
      <p class="lead">Klik på en fase for at folde indholdet ud.</p>
    </div>
    <div class="timeline" id="timeline">
      <div class="timeline-rail"><div class="fill" id="rail-fill"></div></div>
      ${phases.map((ph, i) => `
      <div class="phase${i===0?' active':''} reveal" data-phase>
        <div class="phase-dot"></div>
        <div class="phase-head">
          <span class="phase-tag">${esc(ph.tag||'')}</span>
          <span class="phase-label">${esc(ph.label||'')}</span>
          <span class="phase-toggle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>
        </div>
        <div class="phase-items">
          ${(ph.items||[]).map(item=>`<div class="phase-item"><span class="pmark">→</span>${esc(item)}</div>`).join('')}
        </div>
      </div>`).join('')}
    </div>
  </div>
</section>` : ''}

<!-- ============ FAQ ============ -->
<section class="section-pad wrap" id="faq">
  <div class="faq-grid">
    <div class="faq-head reveal">
      <span class="eyebrow">Ofte stillede spørgsmål</span>
      <h2 class="display" style="margin-top:18px">Alt du skal vide, før du booker</h2>
      <p class="lead" style="margin-top:18px">Finder du ikke svaret? Vi sidder klar alle hverdage 08–16.</p>
      ${course.supplier_email ? `<a class="faq-contact" href="mailto:${esc(course.supplier_email)}">
        <span class="fc-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7L22 6"/></svg></span>
        Skriv til ${esc(course.supplier_email)}
      </a>` : ''}
    </div>
    <div class="faq-list reveal reveal-d1">
      <details class="faq-item" open>
        <summary>Hvad er inkluderet i prisen?<span class="faq-plus"></span></summary>
        <div class="faq-a">${included.length ? esc(included.join(', ')) + ' er alle inkluderet i prisen. Ingen skjulte gebyrer.' : 'Undervisning og kursusbevis er inkluderet. Kontakt udbyderen for detaljer.'}</div>
      </details>
      <details class="faq-item">
        <summary>Kan jeg betale med faktura eller EAN?<span class="faq-plus"></span></summary>
        <div class="faq-a">Ja. Vælg faktura, EAN, kort eller MobilePay ved booking. For virksomheder og det offentlige sender vi en faktura — betaling forfalder efter kurset.</div>
      </details>
      <details class="faq-item">
        <summary>Hvad sker der, hvis jeg bliver forhindret?<span class="faq-plus"></span></summary>
        <div class="faq-a">Du kan afbestille gratis indtil 14 dage før kursusstart og få pengene retur. Derefter kan du frit overdrage din plads til en kollega.</div>
      </details>
      <details class="faq-item">
        <summary>Kan vi være flere fra samme virksomhed?<span class="faq-plus"></span></summary>
        <div class="faq-a">Ja. Ved 3+ deltagere fra samme sted får I automatisk 10% mængderabat. Ønsker I endnu mere, afholder vi gerne kurset som lukket firmahold.</div>
      </details>
      <details class="faq-item">
        <summary>Hvornår modtager jeg en bekræftelse?<span class="faq-plus"></span></summary>
        <div class="faq-a">Vi sender en bekræftelsesmail inden for 24 timer. Heri finder du alle praktiske detaljer om kurset, venue og eventuel forplejning.</div>
      </details>
    </div>
  </div>
</section>

<!-- ============ FIRMAHOLD ============ -->
<section class="section-pad wrap" id="firmahold">
  <div class="firma-card reveal">
    <div class="firma-deco" aria-hidden="true"></div>
    <div class="firma-main">
      <span class="eyebrow on-dark">Firmahold</span>
      <h2>Skal hele teamet deltage?</h2>
      <p>Få <em>${esc(course.title)}</em> som lukket hold — tilpasset jeres branche, jeres cases og jeres mål. Hos jer eller hos os, fysisk eller online.</p>
      <div class="firma-cta">
        <button class="btn-light" id="firma-book-btn">Få et uforpligtende tilbud <span class="arrow">→</span></button>
        <span class="firma-note">Typisk svar inden for 24 timer</span>
      </div>
    </div>
    <div class="firma-stats">
      <div class="fstat"><b>Fra 6</b><span>deltagere pr. hold</span></div>
      <div class="fstat"><b>÷25%</b><span>pr. deltager</span></div>
      <div class="fstat"><b>100%</b><span>skræddersyet</span></div>
    </div>
  </div>
</section>

<!-- ============ RELATED COURSES ============ -->
${related.length > 0 ? `
<section class="section-pad wrap" id="related">
  <div class="section-head reveal">
    <div>
      <span class="eyebrow">Fortsæt din udvikling</span>
      <h2 class="display" style="margin-top:18px">Kursister på dette hold valgte også</h2>
    </div>
    <a class="see-all" href="Kategorier.html">Se alle kurser <span class="arrow">→</span></a>
  </div>
  <div class="related-grid reveal reveal-d1">
    ${related.map(r => `
    <a class="rc-card" href="kursus.html?id=${+r.id}">
      <div class="card-media${r.image_src ? ' has-img' : ''}" data-card-media style="--card-tint:${safeColor(r.color)}">
        ${r.image_src ? `<img class="card-img" src="${esc(r.image_src)}" alt="" loading="lazy">` : ''}
        <span class="card-monogram" aria-hidden="true">${esc(monogram(r.title))}</span>
        <div class="cm-row">
          <span class="cm-chip">${esc((r.category_label||'').split(' ')[0])}</span>
          ${r.rating ? `<span class="cm-signal"><span class="cm-star">★</span>${(+r.rating).toFixed(1).replace('.',',')}</span>` : ''}
        </div>
        <span class="rc-go" aria-hidden="true">→</span>
      </div>
      <div class="rc-body">
        <h3 class="rc-title">${esc(r.title)}</h3>
        <div class="rc-supplier">${esc(r.supplier_name||'')}</div>
        <div class="rc-foot">
          <span class="rc-dur">${esc(r.duration||'')}</span>
          <span class="rc-price">${r.price ? 'kr. ' + (+r.price).toLocaleString('da-DK') + '<small> ekskl. moms</small>' : '<span style="color:var(--accent-deep)">Gratis*</span>'}</span>
        </div>
      </div>
    </a>`).join('')}
  </div>
  <!-- Notify -->
  ${notifyHTML}
</section>` : ''}

${related.length === 0 ? `
<section class="section-pad wrap" id="updates">
  ${notifyHTML}
</section>` : ''}

</main>`;
  }

  /* ============================================================
     SOCIAL PROOF + REVIEWS
     Real reviews (from Min side) take over from the canned quote as
     soon as they exist; up to 6 written ones get their own cards.
  ============================================================ */
  function reviewStars(rating) {
    const r = Math.max(1, Math.min(5, Number(rating) || 0));
    return '★'.repeat(r) + '<span class="rev-dim">' + '★'.repeat(5 - r) + '</span>';
  }

  function proofHTML(course, reviews) {
    const withComment = reviews.filter(r => (r.comment || '').trim());
    if (!(course.rating && course.review_count) && !reviews.length) return '';

    const quote = withComment.length
      ? { text: withComment[0].comment, author: withComment[0].name || 'Kursist' }
      : { text: 'Utrolig relevant og godt struktureret kursus. Brugte teknikkerne allerede ugen efter — og det virkede.', author: 'Tidligere kursist' };

    const cards = withComment.slice(0, 6).map(r => `
      <figure class="review-card reveal">
        <div class="rev-stars">${reviewStars(r.rating)}</div>
        <blockquote>${esc(r.comment)}</blockquote>
        <figcaption><b>${esc(r.name || 'Kursist')}</b>${r.created_at ? ' · ' + esc(fmtDateFull(String(r.created_at).slice(0, 10))) : ''}</figcaption>
      </figure>`).join('');

    return `
<section class="proof wrap" id="anmeldelser">
  <div class="proofbar reveal">
    <div class="proof-stat">
      <span class="ps-num">${(+course.rating || 5).toFixed(1).replace('.',',')}</span>
      <span class="ps-stars">★★★★★</span>
      <span class="ps-label">${(+course.review_count || reviews.length).toLocaleString('da-DK')} anmeldelser</span>
    </div>
    <blockquote class="proof-quote"><span class="qm">"</span>${esc(quote.text)}<span class="qm">"</span></blockquote>
    <div class="proof-author"><b>${esc(quote.author)}</b>via Futurematch</div>
  </div>
  ${cards ? `<div class="review-grid">${cards}</div>` : ''}
</section>`;
  }

  /* ============================================================
     SUPPLIER DESCRIPTION
     Vendor exports are one long wall of <p>/<strong>/<br> HTML, so the
     page splits them into scannable collapsible sections keyed on the
     bold one-line headings the exports use (Beskrivelse, Udbytte, …).
     Descriptions without detectable headings fall back to a clamped
     block with a "read more" toggle.
  ============================================================ */
  const HEADING_WORDS = /^(beskrivelse|udbytte|dit udbytte|deltagerprofil|målgruppe|indhold|kursusindhold|emneoversigt|forudsætninger|eksamen|certificering|underviser|undervisere|om underviseren|praktisk|praktisk information|formål|kursusmål|program|dagsprogram|agenda|opbygning|varighed|det lærer du|det får du|om kurset|tilmelding|niveau|metode|undervisningsform|materialer|kursusbevis|indledning|afholdelse|sted|pris|priser|datoer|bemærkninger)\b/i;

  function normalizeVendorHtml(html) {
    let out = safeRichHtml(html)
      .replace(/&nbsp;/gi, ' ')
      // vendor exports carry inline presentation that clashes with the design
      .replace(/\s(?:style|class|id|align|width|height|face|color|dir|lang)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/<\/?(?:font|u)\b[^>]*>/gi, '')
      // runs of 2+ <br> separate paragraphs in the vendor exports
      .replace(/(?:\s*<br\s*\/?>\s*){2,}/gi, '</p><p>');
    // strip empty inline shells (<strong></strong> etc.), repeated for nesting
    for (let i = 0; i < 3; i++) out = out.replace(/<(strong|em|b|i|span|p)>\s*<\/\1>/gi, '');
    return out;
  }

  function headingText(text) {
    return String(text || '').trim().replace(/[:\s]+$/, '');
  }

  // Bold short lines are headings; plain-text lines only when they are one of
  // the section words the exports use (Målgruppe, Forudsætninger, …) — many
  // suppliers write those without any markup at all. The comma guard keeps
  // bold testimonial attributions ("Navn, Titel, Firma") out.
  function isHeadingText(t, bold) {
    if (!t || t.length > 60 || /[.!?]$/.test(t)) return false;
    if (bold) return HEADING_WORDS.test(t) || (t.length <= 46 && !/,/.test(t));
    return HEADING_WORDS.test(t) && t.length <= 40;
  }

  // "Modul 3: …"-style headings become subheadings inside the current
  // section instead of flooding the accordion with one entry per module.
  const MODULE_SUB = /^(modul|module|appendix|dag|del|trin|fase)\s*\d/i;

  // Headings that carry a real section word anywhere in them start a new
  // top-level section ("Dit udbytte på uddannelsen", "Kursusform ved virtuel
  // afholdelse"); topic headlines without one ("Diagrammer", "Udskrivning")
  // stay inside the current section as subheadings.
  const SECTION_STEM = /(beskrivelse|indledning|udbytte|deltagere?\b|deltagerprofil|målgruppe|indhold|emner?\b|forudsætninger?|eksamen|certificer\w*|underviser\w*|instruktør\w*|praktisk|formål|kursusmål|program\w*|agenda|opbygning|varighed|lærer du|får du|tilmelding|niveau|metoder?\b|materialer?\b|kursusbevis|afholdelse|moduler?\b|forberedelse|udtalelser?|referencer?|økonomisk støtte|sprog|form|pris(er)?\b|datoer?\b|sted(er)?\b|bemærkning\w*)\b/i;

  // Sections that ARE the story rather than a fact: merged into open prose.
  const NARRATIVE_RE = /^(beskrivelse|indledning|om kurset)\b/i;

  // Icon per fact-card type, first match wins (feather-style strokes).
  const FACT_ICONS = [
    [/målgruppe|deltager/i, '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'],
    [/forudsætning|forberedelse/i, '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'],
    [/kursusmål|formål|udbytte|lærer du|får du/i, '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'],
    [/eksamen|certificer|kursusbevis/i, '<circle cx="12" cy="8" r="6"/><path d="m15.5 13 1.5 8-5-3-5 3 1.5-8"/>'],
    [/materiale/i, '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'],
    [/underviser|instruktør/i, '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'],
    [/varighed|opbygning/i, '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'],
    [/sted|afholdelse|lokation/i, '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'],
    [/pris|økonomisk|støtte/i, '<path d="M20.59 13.41 12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>'],
    [/dato|tilmelding/i, '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>'],
    [/sprog/i, '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z"/>'],
    [/niveau/i, '<path d="M6 20V10M12 20V4M18 20v-6"/>'],
    [/form|metode|undervisning/i, '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'],
  ];

  function factIcon(title) {
    const hit = FACT_ICONS.find(pair => pair[0].test(title));
    const paths = hit ? hit[1] : '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }

  function plainText(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isFullyBold(el) {
    const strong = el.querySelector('strong, b');
    return !!strong && (strong.textContent || '').trim().length >= (el.textContent || '').trim().length - 2;
  }

  function isHeadingBlock(el) {
    if (/^H[1-6]$/.test(el.tagName)) return true;
    return isHeadingText(headingText(el.textContent), isFullyBold(el));
  }

  // "<strong>Overskrift</strong><br>indhold…" packed into one block → split.
  function splitLeadingHeading(el) {
    const m = el.innerHTML.match(/^\s*<(strong|b)>\s*([^<]{2,60}?)\s*<\/\1>\s*<br\s*\/?>\s*([\s\S]*)$/i);
    if (!m) return null;
    const t = headingText(m[2]);
    if (!isHeadingText(t, true)) return null;
    const rest = document.createElement('p');
    rest.innerHTML = m[3];
    return { title: t, rest: (rest.textContent || '').trim() ? rest : null };
  }

  function blockHTML(el) {
    // strip decorative <br> runs left at the block edges
    el.innerHTML = el.innerHTML.replace(/^(?:\s*<br\s*\/?>)+/i, '').replace(/(?:<br\s*\/?>\s*)+$/i, '');
    const text = (el.textContent || '').trim();
    // exports bold entire paragraphs — unwrap them so they read as body text
    if (text.length > 70 && isFullyBold(el)) {
      const strong = el.querySelector('strong, b');
      return '<p>' + strong.innerHTML + '</p>';
    }
    // lines separated by single <br> are the exports' bullet lists
    const segText = s => { const d = document.createElement('div'); d.innerHTML = s; return (d.textContent || '').trim(); };
    const segs = el.innerHTML.split(/<br\s*\/?>/i).map(s => s.trim()).filter(s => segText(s));
    if (segs.length >= 3 && segs.every(s => segText(s).length <= 130)) {
      return '<ul class="desc-list">' + segs.map(s => '<li>' + s + '</li>').join('') + '</ul>';
    }
    return el.outerHTML;
  }

  function splitSections(html) {
    const doc = new DOMParser().parseFromString('<div id="dr">' + normalizeVendorHtml(html) + '</div>', 'text/html');
    const sections = [];
    let current = { title: '', parts: [] };
    function startSection(title) {
      if (current.parts.length || current.title) {
        if (MODULE_SUB.test(title) || !SECTION_STEM.test(title)) {
          current.parts.push('<h4 class="desc-subhead">' + esc(title) + '</h4>');
          return;
        }
      }
      if (current.parts.length) sections.push(current);
      current = { title: title, parts: [] };
    }
    Array.prototype.forEach.call(doc.getElementById('dr').childNodes, node => {
      if (node.nodeType === 3) {
        const t = node.textContent.trim();
        if (!t) return;
        if (isHeadingText(headingText(t), false)) startSection(headingText(t));
        else current.parts.push('<p>' + esc(t) + '</p>');
        return;
      }
      if (node.nodeType !== 1) return;
      const text = (node.textContent || '').trim();
      if (!text && !node.querySelector('img')) return;
      if (isHeadingBlock(node)) { startSection(headingText(text)); return; }
      const lead = splitLeadingHeading(node);
      if (lead) {
        startSection(lead.title);
        if (lead.rest) current.parts.push(blockHTML(lead.rest));
        return;
      }
      current.parts.push(blockHTML(node));
    });
    if (current.parts.length) sections.push(current);
    // some exports contain the whole description twice — drop later sections
    // repeating an earlier title OR an earlier section's content (the copies
    // sometimes carry slightly different titles over identical text)
    const seenTitle = {}, seenContent = {};
    return truncateRepeatedCopy(sections).filter(s => {
      const t = s.title.trim().toLowerCase();
      const c = plainText(s.parts.join(' ')).slice(0, 140).toLowerCase();
      if ((t && seenTitle[t]) || (c.length > 60 && seenContent[c])) return false;
      if (t) seenTitle[t] = true;
      if (c.length > 60) seenContent[c] = true;
      return true;
    });
  }

  // Several exports append a REWRITTEN second copy of the whole description,
  // which the content dedupe can't match. The tell is section titles starting
  // to repeat: when 2+ repeats occur from some point on, everything from the
  // first repeat is the stale copy — cut it.
  function truncateRepeatedCopy(sections) {
    const seen = {};
    let cut = -1;
    for (let i = 0; i < sections.length; i++) {
      const t = sections[i].title.trim().toLowerCase();
      if (t && seen[t]) { cut = i; break; }
      if (t) seen[t] = true;
    }
    if (cut < 0) return sections;
    let dups = 0;
    for (let i = cut; i < sections.length; i++) {
      const t = sections[i].title.trim().toLowerCase();
      if (t && seen[t]) dups++;
    }
    return dups >= 2 ? sections.slice(0, cut) : sections;
  }

  function descriptionHTML(course) {
    if (!course.body_html) return '';
    let sections = [];
    try { sections = splitSections(course.body_html); } catch (_) { /* fall back to clamp */ }

    const head = `
    <div class="section-head" style="margin-bottom:26px">
      <div>
        <span class="eyebrow">Kursusbeskrivelse</span>
        <h2 class="display" style="margin-top:18px;font-size:clamp(1.9rem,3.4vw,2.8rem)">Om kurset</h2>
      </div>
      ${course.product_type ? `<p class="lead">${esc(course.product_type)} fra ${esc(course.supplier_name || 'udbyderen')}</p>` : ''}
    </div>`;

    const clampBlock = (inner, extraClass) => `
    <div class="desc-clamp${extraClass ? ' ' + extraClass : ''}">
      ${inner}
      <div class="desc-fade"></div>
    </div>
    <button class="desc-toggle" type="button" data-desc-toggle hidden>Læs mere <span class="arrow">↓</span></button>`;

    const ctaHTML = `
    <div class="desc-cta">
      <button class="btn-book" data-scroll="#datoer">Se datoer og book <span class="arrow">→</span></button>
      <span class="desc-cta-note">Gratis afbestilling indtil 14 dage før</span>
    </div>`;

    if (!sections.length) {
      return `
<section class="section-pad wrap" id="beskrivelse">
  <div class="supplier-description reveal">
    ${head}
    ${clampBlock(`<div class="supplier-rich-content">${safeRichHtml(course.body_html)}</div>`, 'intro')}
    ${ctaHTML}
  </div>
</section>`;
    }

    // The story reads as open prose: the untitled intro, leading
    // Beskrivelse/Indledning sections — or, failing both, the supplier's own
    // lead headline section (its title kept as an in-flow heading).
    const narrative = [];
    if (sections[0].title === '') narrative.push(sections.shift());
    while (sections.length && (NARRATIVE_RE.test(sections[0].title) || !narrative.length)) {
      const s = sections.shift();
      if (s.title && !NARRATIVE_RE.test(s.title)) s.parts.unshift('<h3>' + esc(s.title) + '</h3>');
      narrative.push(s);
    }

    // Short factual sections become scannable cards; only the genuinely long
    // ones (content outlines, module lists) stay collapsible.
    const factish = [], deep = [];
    sections.forEach(s => {
      const joined = s.parts.join('');
      const textLen = plainText(joined).length;
      const listItems = (joined.match(/<li>/gi) || []).length;
      if (textLen <= 380 && listItems <= 4 && joined.indexOf('desc-subhead') < 0) factish.push(s);
      else deep.push(s);
    });

    const proseHTML = narrative.map(s => s.parts.join('')).join('');
    const factCardsHTML = factish.length ? `
    <div class="desc-facts">${factish.map(s => `
      <div class="desc-fact-card">
        <h4><span class="dfc-ic">${factIcon(s.title)}</span>${esc(s.title)}</h4>
        <div class="dfc-body supplier-rich-content">${s.parts.join('')}</div>
      </div>`).join('')}
    </div>` : '';
    const deepHTML = deep.length ? `
    <div class="desc-sections">${deep.map((s, i) => `
    <details class="desc-section"${!proseHTML && !factCardsHTML && i === 0 ? ' open' : ''}>
      <summary><span class="ds-title">${esc(s.title || 'Om kurset')}</span><span class="ds-plus"></span></summary>
      <div class="ds-body supplier-rich-content">${s.parts.join('')}</div>
    </details>`).join('')}
    </div>` : '';

    return `
<section class="section-pad wrap" id="beskrivelse">
  <div class="supplier-description reveal">
    ${head}
    ${proseHTML ? clampBlock(`<div class="supplier-rich-content desc-intro">${proseHTML}</div>`, 'intro') : ''}
    ${factCardsHTML}
    ${deepHTML}
    ${ctaHTML}
  </div>
</section>`;
  }

  function initDescription() {
    document.querySelectorAll('.desc-clamp').forEach(clamp => {
      const toggle = clamp.nextElementSibling;
      if (!toggle || !toggle.hasAttribute || !toggle.hasAttribute('data-desc-toggle')) return;
      // short content needs no clamp at all
      if (clamp.scrollHeight <= clamp.clientHeight + 60) {
        clamp.classList.add('expanded');
        return;
      }
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        const on = clamp.classList.toggle('expanded');
        toggle.innerHTML = on ? 'Vis mindre <span class="arrow">↑</span>' : 'Læs mere <span class="arrow">↓</span>';
        if (!on) clamp.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }

  /* ============================================================
     SESSION PICKER
  ============================================================ */
  function initSessionPicker(byLoc, locKeys, course) {
    if (!locKeys.length) return;

    const tabs    = Array.prototype.slice.call(document.querySelectorAll('.loc-tab'));
    const list    = document.getElementById('session-list');
    const sumLoc  = document.getElementById('sum-loc');
    const sumDate = document.getElementById('sum-date');
    const sumFmt  = document.getElementById('sum-format');
    const scarc   = document.getElementById('sum-scarcity');
    const sbSub   = document.getElementById('sb-sub');

    const bookingCta = document.getElementById('add-cart-cta');

    // Prefer real remaining capacity over total seats when the API provides it.
    function seatsOf(s) { return sessionSeatsRemaining(s); }

    function locLabel(locKey) { return locKey === 'online' ? 'Online' : locKey; }

    function setBookingCta(bookable) {
      if (bookingCta) bookingCta.innerHTML = bookable
        ? 'Læg i kurv <span class="arrow">→</span>'
        : 'Skriv mig på venteliste <span class="arrow">→</span>';
      const sbBtn = document.getElementById('sb-cta');
      if (sbBtn) sbBtn.textContent = bookable ? 'Læg i kurv' : 'Få besked';
    }

    if (list) {
      list.setAttribute('role', 'radiogroup');
      list.setAttribute('aria-label', 'Vælg en dato og lokation');
    }

    function setScarcity(seats) {
      if (!scarc) return;
      if (seats != null && seats <= 6) {
        scarc.innerHTML = `<span class="sc-dot"></span>Kun ${seats} pladser tilbage på dette hold`;
        scarc.hidden = false;
      } else { scarc.hidden = true; }
    }

    function pickSession(card) {
      document.querySelectorAll('.session').forEach(s => {
        s.setAttribute('aria-selected', 'false');
        s.setAttribute('aria-checked', 'false');
        s.tabIndex = -1;
      });
      card.setAttribute('aria-selected', 'true');
      card.setAttribute('aria-checked', 'true');
      card.tabIndex = 0;
      const dt = card.dataset;
      selectedSession = { id: +dt.id, date: dt.date, location: dt.loc, venue: dt.venue || '', format: dt.format, price: +(dt.price || course.price || 0) };
      if (sumLoc)  sumLoc.textContent  = dt.loc;
      if (sumDate) sumDate.textContent = fmtDateFull(dt.date);
      if (sumFmt)  sumFmt.textContent  = dt.format;
      const sumTotal = document.querySelector('.bs-total .tval');
      if (sumTotal) sumTotal.innerHTML = priceMarkup(dt.price || course.price, course.badge);
      if (sbSub)   sbSub.textContent   = `${dt.loc} · ${fmtDateFull(dt.date)}`;
      setScarcity(dt.seats ? +dt.seats : null);
      setBookingCta(true);
    }

    function showNoAvailable(locKey) {
      selectedSession = null;
      const label = locLabel(locKey);
      if (sumLoc)  sumLoc.textContent  = label;
      if (sumDate) sumDate.textContent = 'Venteliste';
      if (sumFmt)  sumFmt.textContent  = 'Ingen ledige pladser';
      if (sbSub)   sbSub.textContent   = `${label} · få besked om nye datoer`;
      if (scarc)   scarc.hidden = true;
      setBookingCta(false);
    }

    // Move selection+focus to a sibling session row (keyboard arrow nav).
    function moveSession(current, dir) {
      const rows = Array.prototype.slice.call(list.querySelectorAll('.session:not(.is-sold-out)'));
      const idx = rows.indexOf(current);
      if (idx < 0) return;
      const next = rows[(idx + dir + rows.length) % rows.length];
      if (next) { pickSession(next); next.focus(); }
    }

    function renderLoc(locKey) {
      const sessions = byLoc[locKey] || [];
      if (!list) return;
      list.innerHTML = '';
      sessions.forEach((s, i) => {
        const d = new Date(s.date);
        const day = String(d.getDate()).padStart(2,'0');
        const mon = M_ABBR[d.getMonth()];
        const seats = seatsOf(s);
        const soldOut = seats != null && seats <= 0;
        const seatTxt = soldOut
          ? '<span class="sold">Udsolgt</span>'
          : seats != null && seats <= 4
          ? `<span class="low">Kun ${seats} pladser</span>`
          : seats != null ? `<b>${seats}</b> pladser` : 'Ledige pladser';
        const popTag = s.is_popular ? `<span class="session-pop">Populært</span>` : '';
        const el = document.createElement('div');
        el.className = 'session' + (soldOut ? ' is-sold-out' : '');
        el.setAttribute('role', 'radio');
        el.setAttribute('aria-selected', 'false');
        el.setAttribute('aria-checked', 'false');
        if (soldOut) el.setAttribute('aria-disabled', 'true');
        el.tabIndex = soldOut ? -1 : (i===0 ? 0 : -1);
        el.dataset.id     = s.id;
        el.dataset.date   = s.date;
        el.dataset.loc    = s.location;
        el.dataset.venue  = s.venue || '';
        el.dataset.format = s.format;
        el.dataset.seats  = seats;
        el.dataset.price  = s.variant_price != null ? s.variant_price : (+course.price || 0);
        el.dataset.online = String(!!s.is_online);
        el.innerHTML = `
          <div class="session-date"><div class="d">${day}</div><div class="m">${mon}</div></div>
          <div class="session-main">
            <div class="sloc">${esc(s.venue || s.location)} ${popTag}</div>
            <div class="smeta"><span>${esc(s.location)}</span><span>${s.date_text ? esc(s.date_text) : '09:00–16:00'}${s.end_date ? ' · slutter ' + fmtDateFull(s.end_date) : ''}</span></div>
          </div>
          <span class="session-format${s.is_online?' online':''}">${s.is_online?'Online':'Fysisk'}</span>
          <div class="session-seats">${seatTxt}</div>
          <span class="session-radio"></span>`;
        if (!soldOut) {
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
        }
        list.appendChild(el);
      });
      const first = list.querySelector('.session:not(.is-sold-out)');
      if (first) pickSession(first);
      else showNoAvailable(locKey);
    }

    // Move active location tab (keyboard arrow nav across the tablist).
    function activateTab(t) {
      tabs.forEach(x => { x.setAttribute('aria-selected', 'false'); x.tabIndex = -1; });
      t.setAttribute('aria-selected', 'true');
      t.tabIndex = 0;
      renderLoc(t.dataset.loc);
    }

    tabs.forEach((t, i) => {
      t.tabIndex = i===0 ? 0 : -1;
      t.addEventListener('click', () => activateTab(t));
      t.addEventListener('keydown', e => {
        let target = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = tabs[(i+1) % tabs.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = tabs[(i-1+tabs.length) % tabs.length];
        else if (e.key === 'Home') target = tabs[0];
        else if (e.key === 'End') target = tabs[tabs.length-1];
        if (target) { e.preventDefault(); activateTab(target); target.focus(); }
      });
    });

    renderLoc(locKeys[0]);
  }

  /* ============================================================
     CURRICULUM ACCORDION
  ============================================================ */
  function initCurriculum() {
    const phases = document.querySelectorAll('[data-phase]');
    phases.forEach(p => {
      p.querySelector('.phase-head')?.addEventListener('click', () => {
        const active = p.classList.contains('active');
        phases.forEach(x => x.classList.remove('active'));
        if (!active) p.classList.add('active');
      });
    });
  }

  /* ============================================================
     CART ACTIONS
  ============================================================ */
  function initCartActions(course) {
    const Cart = window.FuturematchCart;

    function flashButton(btn) {
      if (!btn) return;
      const original = btn.innerHTML;
      btn.innerHTML = 'Lagt i kurv <span class="arrow">✓</span>';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerHTML = original;
        btn.disabled = false;
      }, 1200);
    }

    function toast(message) {
      const old = document.querySelector('.cart-toast');
      if (old) old.remove();
      const el = document.createElement('div');
      el.className = 'cart-toast';
      el.textContent = message;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2400);
    }

    function addSelectedToCart(sourceBtn) {
      if (!selectedSession) {
        const directBooking = document.getElementById('direct-booking-cta');
        if (directBooking) {
          directBooking.click();
          return;
        }
        const dates = document.getElementById('datoer');
        if (dates) dates.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        toast('Vælg en dato først');
        return;
      }
      if (!Cart) return;
      Cart.addItem({
        session_id: selectedSession.id,
        course_id: course.id,
        course_title: course.title,
        supplier_name: course.supplier_name || '',
        date: selectedSession.date,
        location: selectedSession.location,
        venue: selectedSession.venue || '',
        format: selectedSession.format,
        participants: 1,
        unit_price: selectedSession.price != null ? selectedSession.price : (+course.price || 0),
        badge: course.badge || '',
        url: 'kursus.html?id=' + course.id,
      });
      flashButton(sourceBtn);
      toast(course.title + ' er lagt i kurven');
    }

    const cartBtn = document.getElementById('add-cart-cta');
    cartBtn?.addEventListener('click', () => addSelectedToCart(cartBtn));
    const stickyBtn = document.getElementById('sb-cta');
    stickyBtn?.addEventListener('click', () => addSelectedToCart(stickyBtn));
  }

  /* ============================================================
     RAIL FILL
  ============================================================ */
  function initRailFill() {
    const rail     = document.getElementById('rail-fill');
    const timeline = document.getElementById('timeline');
    if (!rail || !timeline || reduce) { if (rail) rail.style.height='100%'; return; }
    let raf;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const r = timeline.getBoundingClientRect();
        const prog = (window.innerHeight * .55 - r.top) / r.height;
        rail.style.height = (Math.max(0, Math.min(1, prog)) * 100) + '%';
        raf = null;
      });
    }, { passive: true });
  }

  /* ============================================================
     GALLERY + LIGHTBOX
  ============================================================ */
  function initGallery(course) {
    const images = galleryImages(course);
    const root = document.getElementById('course-gallery');
    if (!root || !images.length) return;

    // A logo needs a short header; a photograph earns a tall one. The verdict
    // covers the whole gallery rather than the current image, so stepping
    // through the set never changes the card's height under the visitor.
    const heroFrame = root.querySelector('.hero-media');
    const heroCard  = root.closest('.bcard');
    if (heroFrame && window.FMCardMedia) {
      window.FMCardMedia.classifyAll(images.map(i => i.src), kinds => {
        const known = kinds.filter(Boolean);
        const logoOnly = known.length > 0 && known.every(k => k === 'is-logo');
        const kind = !known.length ? 'is-failed' : logoOnly ? 'is-logo' : 'is-photo';
        heroFrame.classList.remove('is-photo', 'is-logo');
        heroFrame.classList.add(kind);
        // the card needs the verdict too: only a photo should swallow the
        // column's spare height
        if (heroCard) {
          heroCard.classList.remove('is-photo', 'is-logo');
          heroCard.classList.add(kind);
        }
      });
    }

    const main     = document.getElementById('gallery-main');
    const backdrop = document.getElementById('gallery-backdrop');
    const count    = document.getElementById('gallery-count');
    const thumbs   = Array.prototype.slice.call(root.querySelectorAll('[data-gallery-index]'));
    let index = 0;
    let lightboxOpen = false;
    let lastFocused  = null;

    function show(next) {
      index = (next + images.length) % images.length;
      const img = images[index];
      main.src = img.src;
      main.alt = img.alt || course.image_alt_text || course.title;
      if (backdrop) backdrop.src = img.src;
      // a broken image in the middle of the set shouldn't hide the whole stage
      main.closest('.hero-media').classList.remove('img-failed');
      if (count) count.textContent = (index + 1) + ' / ' + images.length;
      thumbs.forEach((t, i) => {
        t.classList.toggle('is-active', i === index);
        t.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
      if (lightboxOpen) paintLightbox();
    }

    root.querySelectorAll('[data-gallery-step]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        show(index + Number(btn.dataset.galleryStep));
      });
    });
    thumbs.forEach(t => t.addEventListener('click', () => show(Number(t.dataset.galleryIndex))));

    // arrow keys move through the set while the gallery has focus
    root.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    });

    /* ---- lightbox ---- */
    const box      = document.getElementById('lightbox');
    const boxImg   = document.getElementById('lb-img');
    const boxCap   = document.getElementById('lb-caption-text');
    const boxCount = document.getElementById('lb-count');
    const stage    = document.getElementById('gallery-stage');

    function paintLightbox() {
      if (!boxImg) return;
      const img = images[index];
      boxImg.src = img.src;
      boxImg.alt = img.alt || course.title;
      if (boxCap) boxCap.textContent = img.alt || '';
      if (boxCount) boxCount.textContent = images.length > 1 ? (index + 1) + ' / ' + images.length : '';
    }

    function openLightbox() {
      if (!box) return;
      lastFocused = document.activeElement;
      lightboxOpen = true;
      paintLightbox();
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      const close = document.getElementById('lb-close');
      if (close) close.focus();
    }

    function closeLightbox() {
      if (!box || !lightboxOpen) return;
      lightboxOpen = false;
      box.hidden = true;
      document.body.style.overflow = '';
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    if (stage && box) {
      stage.addEventListener('click', openLightbox);
      box.querySelectorAll('[data-lb-step]').forEach(btn => {
        btn.addEventListener('click', () => show(index + Number(btn.dataset.lbStep)));
      });
      box.querySelectorAll('[data-lb-close]').forEach(btn => btn.addEventListener('click', closeLightbox));
      // click the backdrop, not the picture, to dismiss
      box.addEventListener('click', e => { if (e.target === box) closeLightbox(); });
      document.addEventListener('keydown', e => {
        if (!lightboxOpen) return;
        if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
      });
      box.querySelectorAll('.lb-nav').forEach(btn => { btn.hidden = images.length < 2; });
    }

    /* ---- touch swipe (stage + lightbox) ---- */
    if (images.length > 1) {
      [root.querySelector('.hero-media'), box].forEach(surface => {
        if (!surface) return;
        let startX = null, startY = null;
        surface.addEventListener('touchstart', e => {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        }, { passive: true });
        surface.addEventListener('touchend', e => {
          if (startX == null) return;
          const dx = e.changedTouches[0].clientX - startX;
          const dy = e.changedTouches[0].clientY - startY;
          // horizontal intent only — a vertical drag is the page scrolling
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.6) show(index + (dx < 0 ? 1 : -1));
          startX = startY = null;
        }, { passive: true });
      });
    }
  }

  /* ============================================================
     PARALLAX
  ============================================================ */
  function initParallax() {
    if (reduce) return;
    const px = document.querySelector('[data-parallax]');
    if (!px) return;
    let raf;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const off = (px.getBoundingClientRect().top - window.innerHeight / 2) * -0.04;
        px.style.transform = `translateY(${off.toFixed(1)}px)`;
        raf = null;
      });
    }, { passive: true });
  }

  /* ============================================================
     BOOKING MODAL
  ============================================================ */
  function initBookingModal(course) {
    const overlay    = document.getElementById('booking-overlay');
    const formStep   = document.getElementById('bm-form-step');
    const successStep= document.getElementById('bm-success-step');
    const submitBtn  = document.getElementById('bm-submit');
    const paymentWrap= document.getElementById('bm-payment-wrap');
    const messageRow = document.getElementById('bm-message-row');
    const errorBox   = document.getElementById('bm-error');
    let lastFocused  = null;
    let activeMode   = 'booking';

    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    function submitLabel(mode) {
      if (mode === 'firmahold') return 'Send forespørgsel <span class="arrow">→</span>';
      if (mode === 'notify') return 'Skriv mig op <span class="arrow">→</span>';
      return 'Reservér plads <span class="arrow">→</span>';
    }

    function setError(message) {
      if (!errorBox) return;
      errorBox.textContent = message || '';
      errorBox.hidden = !message;
    }

    function setBusy(on) {
      if (!submitBtn) return;
      submitBtn.disabled = on;
      submitBtn.innerHTML = on ? '<span>Sender…</span>' : submitLabel(activeMode);
    }

    function setMode(mode) {
      activeMode = mode;
      setError('');

      const title = document.getElementById('bm-title');
      const icon  = document.getElementById('bm-sum-icon');
      const meta  = document.getElementById('bm-sum-meta');
      const price = document.getElementById('bm-sum-price');
      const msg   = document.getElementById('bm-message');

      const isBooking = mode === 'booking';
      const isFirm    = mode === 'firmahold';

      if (paymentWrap) paymentWrap.hidden = !isBooking;
      if (messageRow) messageRow.hidden = isBooking;
      if (msg) msg.placeholder = isFirm
        ? 'F.eks. antal deltagere, ønsket dato, sted og hvad teamet skal træne'
        : 'F.eks. ønsket by eller om du vil have besked om online hold';

      if (title) title.textContent = isFirm
        ? 'Få tilbud på firmahold'
        : isBooking ? 'Reservér din plads' : 'Få besked om nye datoer';
      if (icon) icon.textContent = isFirm ? '👥' : isBooking ? '📅' : '✉';

      document.getElementById('bm-sum-title').textContent = course.title;
      if (isBooking && selectedSession) {
        if (meta) meta.textContent = `${selectedSession.location} · ${fmtDateFull(selectedSession.date)} · ${selectedSession.format}`;
        if (price) price.textContent = fmtPrice(selectedSession.price != null ? selectedSession.price : course.price, course.badge) + ' ekskl. moms';
      } else if (isFirm) {
        if (meta) meta.textContent = 'Lukket hold for jeres team · fysisk eller online';
        if (price) price.textContent = 'Svar inden for én hverdag';
      } else {
        if (meta) meta.textContent = 'Vi giver besked, når der kommer nye ledige hold';
        if (price) price.textContent = 'Gratis og uforpligtende';
      }
      setBusy(false);
    }

    // The currently visible modal step (form or success) — focus stays trapped within it.
    function activePanel() {
      return (successStep && !successStep.hidden) ? successStep : formStep;
    }
    function focusables() {
      const panel = activePanel() || overlay;
      return Array.prototype.slice.call(panel.querySelectorAll(FOCUSABLE))
        .filter(el => el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    // Hide the rest of the page from AT + tab order while the modal is open.
    function setChromeInert(on) {
      Array.prototype.forEach.call(document.body.children, el => {
        if (el === overlay) return;
        if (on) {
          if ('inert' in HTMLElement.prototype) el.inert = true;
          else el.setAttribute('aria-hidden', 'true');
        } else {
          if ('inert' in HTMLElement.prototype) el.inert = false;
          else el.removeAttribute('aria-hidden');
        }
      });
    }

    function openModal(mode) {
      lastFocused = document.activeElement;
      mode = mode || 'booking';
      if (mode === 'booking' && !selectedSession) mode = 'notify';

      formStep.hidden    = false;
      successStep.hidden = true;
      setMode(mode);
      overlay.hidden     = false;
      document.body.style.overflow = 'hidden';
      setChromeInert(true);
      // Move focus into the modal — close button first, falling back to title/name.
      const closeBtn = document.getElementById('bm-close');
      (closeBtn || document.getElementById('bm-name') || overlay)?.focus();
    }

    function closeModal() {
      overlay.hidden = true;
      document.body.style.overflow = '';
      setChromeInert(false);
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
      lastFocused = null;
    }

    // Trap Tab / Shift+Tab within the visible modal step.
    function trapTab(e) {
      if (e.key !== 'Tab' || overlay.hidden) return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }

    function openFromClick(mode) {
      return function(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        openModal(mode);
      };
    }

    // Open triggers
    document.getElementById('direct-booking-cta')?.addEventListener('click', openFromClick('booking'));
    document.getElementById('no-dates-cta')?.addEventListener('click', openFromClick('notify'));
    document.getElementById('firma-book-btn')?.addEventListener('click', openFromClick('firmahold'));

    // Close triggers
    document.getElementById('bm-close')?.addEventListener('click', closeModal);
    document.querySelectorAll('.bm-close-success').forEach(b => b.addEventListener('click', closeModal));
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeModal(); });
    overlay.addEventListener('keydown', trapTab);

    // Submit
    submitBtn?.addEventListener('click', async () => {
      const nameEl  = document.getElementById('bm-name');
      const emailEl = document.getElementById('bm-email');
      const name  = nameEl?.value.trim();
      const email = emailEl?.value.trim();
      setError('');

      if (!name)  { nameEl.style.borderColor  = 'var(--accent)'; nameEl.focus(); setError('Skriv dit navn for at fortsætte.'); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailEl.style.borderColor = 'var(--accent)';
        emailEl.focus(); setError('Skriv en gyldig e-mailadresse.'); return;
      }
      if (activeMode === 'booking' && !selectedSession) {
        setError('Vælg et hold med ledige pladser først, eller skriv dig på venteliste.');
        return;
      }

      setBusy(true);

      const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || 'faktura';
      const participants  = parseInt(document.getElementById('bm-participants')?.value) || 1;

      try {
        let res;
        if (activeMode === 'booking') {
          res  = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id:       selectedSession.id,
              customer_name:    name,
              customer_email:   email,
              customer_company: document.getElementById('bm-company')?.value.trim() || '',
              customer_phone:   document.getElementById('bm-phone')?.value.trim() || '',
              participants,
              payment_method:   paymentMethod,
              status:           'pending',
            }),
          });
        } else {
          res = await fetch('/api/inquiries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: activeMode === 'firmahold' ? 'firmahold' : 'notify',
              name,
              email,
              phone: document.getElementById('bm-phone')?.value.trim() || '',
              company: document.getElementById('bm-company')?.value.trim() || '',
              participants,
              course_id: course.id,
              course_title: course.title,
              subject: activeMode === 'firmahold' ? 'Firmahold / skræddersyet forløb' : 'Besked om nye datoer',
              message: document.getElementById('bm-message')?.value.trim() || '',
            }),
          });
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Anmodningen kunne ikke sendes');

        // Show success
        const successTitle = document.getElementById('bm-success-title');
        const successCopy = document.getElementById('bm-success-copy');
        const refLabel = document.getElementById('bm-ref-label');
        if (successTitle) successTitle.textContent = activeMode === 'booking'
          ? 'Tak for din tilmelding!'
          : activeMode === 'firmahold' ? 'Tak — vi vender tilbage' : 'Du er skrevet op';
        if (successCopy) successCopy.innerHTML = activeMode === 'booking'
          ? 'Vi har modtaget din anmodning og sender en bekræftelse til <b>' + esc(email) + '</b> inden for 24 timer.'
          : 'Vi har modtaget din henvendelse og kontakter <b>' + esc(email) + '</b> inden for én hverdag.';
        if (refLabel) refLabel.textContent = activeMode === 'booking' ? 'Bookingsreference' : 'Henvendelsesreference';
        document.getElementById('bm-ref-num').textContent = (activeMode === 'booking' ? 'FM-' : 'FMH-') + String(data.id).padStart(4, '0');
        formStep.hidden    = true;
        successStep.hidden = false;

      } catch (e) {
        setBusy(false);
        setError(e.message || 'Der opstod en fejl. Prøv igen eller ring til os.');
      }
    });

    // Reset field borders on input
    document.getElementById('bm-name')?.addEventListener('input', function(){ this.style.borderColor=''; });
    document.getElementById('bm-email')?.addEventListener('input', function(){ this.style.borderColor=''; });
  }

  /* ============================================================
     NOTIFY FORM (email capture → /api/inquiries)
     Bound after render, since the form is injected by renderPage.
  ============================================================ */
  function initNotify(course) {
    const form = document.getElementById('notify-form');
    if (!form) return;
    const err = document.createElement('div');
    err.className = 'notify-error';
    err.hidden = true;
    form.appendChild(err);
    function showNotifyError(message) {
      err.textContent = message || '';
      err.hidden = !message;
    }
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const btn   = form.querySelector('button');
      const email = input && input.value.trim();
      showNotifyError('');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (input) { input.style.borderColor = 'var(--accent)'; input.focus(); }
        showNotifyError('Skriv en gyldig e-mailadresse.');
        return;
      }
      btn.textContent = 'Gemmer…';
      btn.disabled = true;
      try {
        const res = await fetch('/api/inquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'notify',
            email,
            course_id: course ? course.id : null,
            course_title: course ? course.title : '',
            subject: 'Besked om nye datoer',
          }),
        });
        if (!res.ok) throw new Error();
        form.innerHTML = '<div style="font-size:14px;font-weight:600;color:var(--accent-deep);padding:12px 0">✓ Du er tilmeldt. Vi giver besked, når der kommer nye datoer!</div>';
      } catch (_) {
        btn.textContent = 'Hold mig opdateret';
        btn.disabled = false;
        showNotifyError('Tilmelding mislykkedes. Prøv igen om lidt.');
      }
    });
  }

  /* ---- Shade color helper (darken accent for --accent-deep) ---- */
  function shadeColor(hex, pct) {
    try {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + Math.round(((n >> 16) & 255) * pct)));
      const g = Math.max(0, Math.min(255, ((n >> 8)  & 255) + Math.round(((n >> 8)  & 255) * pct)));
      const b = Math.max(0, Math.min(255, (n & 255)         + Math.round((n & 255)          * pct)));
      return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
    } catch { return hex; }
  }

})();
