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
      const [course, sessions] = await Promise.all([
        fetch('/api/courses/' + courseId).then(r => { if (!r.ok) throw new Error('Kurset findes ikke'); return r.json(); }),
        fetch('/api/sessions?course_id=' + courseId).then(r => r.json()),
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
      renderPage(course, sessions, related);
    } catch (e) {
      showError(e.message || 'Kurset kunne ikke hentes.');
    }
  }

  /* ============================================================
     PAGE RENDER
  ============================================================ */
  function renderPage(course, sessions, related) {
    // Set title and accent
    document.title = course.title + ' — Futurematch';
    document.querySelector('meta[name="description"]')?.setAttribute('content', course.short_description || '');

    const accent     = course.category_accent || '#FF5A1F';
    const accentDeep = shadeColor(accent, -0.15);
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-deep', accentDeep);

    const outcomes = Array.isArray(course.outcomes) ? course.outcomes : [];
    const included = Array.isArray(course.included) ? course.included : [];
    const facts    = Array.isArray(course.facts)    ? course.facts    : [];
    const marquee  = Array.isArray(course.marquee_items) ? course.marquee_items : [course.title];
    const phases   = Array.isArray(course.curriculum)    ? course.curriculum    : [];
    const badge    = course.badge || '';

    // Group sessions by location
    const byLoc = {};
    (sessions || []).filter(s => s.status === 'active').forEach(s => {
      const key = s.is_online ? 'online' : s.location;
      if (!byLoc[key]) byLoc[key] = [];
      byLoc[key].push(s);
    });
    const locKeys = Object.keys(byLoc);

    // Build HTML
    contentEl.innerHTML = buildPageHTML(course, outcomes, included, facts, marquee, phases, badge, locKeys, byLoc, related);

    // Show content
    loading.hidden = true;
    contentEl.hidden = false;

    // Init sticky bar
    document.getElementById('sb-title').textContent = course.title;
    document.getElementById('sb-price').textContent = fmtPrice(course.price, badge) + ' ekskl. moms';
    if (course.rating) {
      document.getElementById('sb-rating').hidden = false;
      document.getElementById('sb-rating-val').textContent = (+course.rating).toFixed(1);
    }

    // Init interactions
    initReveals();
    bindScrollBtns();
    initSessionPicker(byLoc, locKeys, course);
    initCurriculum();
    initBookingModal(course);
    initParallax();
    initRailFill();

    // Breadcrumb back link
    const bcBack = document.getElementById('breadcrumb-back');
    if (bcBack) bcBack.addEventListener('click', e => { e.preventDefault(); history.back(); });
  }

  /* ============================================================
     HTML BUILDERS
  ============================================================ */
  function buildPageHTML(course, outcomes, included, facts, marquee, phases, badge, locKeys, byLoc, related) {
    const priceStr  = fmtPrice(course.price, badge);
    const chipLabel = esc(course.category_label || 'Kursus');
    const factsHTML = facts.slice(0, 4).map((f, i) => `
      <div class="fact" id="fact-${i}">
        <div class="k">${esc(f.k)}</div>
        <div class="v">${esc(f.v)}${f.s ? ` <small>${esc(f.s)}</small>` : ''}</div>
      </div>`).join('');

    const marqueeItems = [...marquee, ...marquee].map(t => `<span class="marquee-item">${esc(t)}</span>`).join('');

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
      <div class="hero-supplier">
        <span class="supplier-logo">${esc(course.supplier_abbr || '?')}</span>
        <span>Udbydes af <b>${esc(course.supplier_name || 'Futurematch')}</b>${course.rating ? ` · ${(+course.rating).toFixed(1)} ★ fra ${(+course.review_count||0).toLocaleString('da-DK')} kursister` : ''}</span>
      </div>
      <div class="hero-price">
        <div class="hp-main">
          <div class="hp-label">${esc(course.price_label || 'Pris ekskl. moms')}</div>
          <div class="hp-amount">${badge === 'amu' || course.price === 0 ? 'fra kr. 0<small>,-*</small>' : 'kr. ' + (+course.price).toLocaleString('da-DK') + '<small>,-</small>'}</div>
          ${course.price_note ? `<div class="hp-note">${esc(course.price_note)}</div>` : ''}
        </div>
        <div class="hp-action">
          <button class="btn-book" id="hero-book-btn" data-scroll="#datoer">
            Vælg dato <span class="arrow">→</span>
          </button>
          <div class="pc-reassure light">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            Ingen betaling nu — du vælger dato først
          </div>
        </div>
      </div>
    </div>

    <aside class="hero-aside reveal reveal-d2 is-in">
      <div class="hero-media" data-parallax>
        <image-slot id="hero-course" shape="rounded" radius="28" placeholder="Slip kursusbillede"></image-slot>
        <div class="hero-media-tag">
          <span class="chip accent"><span class="dot" style="background:var(--on-accent)"></span>${esc(course.duration || '1 dag')}</span>
        </div>
      </div>
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
    <a class="amu-cta" href="#">Tjek om du er berettiget <span class="arrow">→</span></a>
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
${course.rating && course.review_count ? `
<section class="proof wrap">
  <div class="proofbar reveal">
    <div class="proof-stat">
      <span class="ps-num">${(+course.rating).toFixed(1).replace('.',',')}</span>
      <span class="ps-stars">★★★★★</span>
      <span class="ps-label">${(+course.review_count).toLocaleString('da-DK')} anmeldelser</span>
    </div>
    <blockquote class="proof-quote"><span class="qm">"</span>Utrolig relevant og godt struktureret kursus. Brugte teknikkerne allerede ugen efter — og det virkede.<span class="qm">"</span></blockquote>
    <div class="proof-author"><b>Tidligere kursist</b>via Futurematch</div>
  </div>
</section>` : ''}

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
    </div>
  </div>` : `
  <div class="booking-grid">
    <div class="reveal reveal-d1">
      <div class="loc-tabs" id="loc-tabs" role="tablist">
        ${locKeys.map((k, i) => `
        <button class="loc-tab" role="tab" aria-selected="${i===0}" data-loc="${esc(k)}">
          <span class="lpin"></span>${esc(k)}
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
      <button class="btn-primary" id="booking-cta">Reservér plads <span class="arrow">→</span></button>
      <div class="bs-microcopy">Ingen betaling nu — bekræft uden binding</div>
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
    <a class="rc-card" href="kursus.html?id=${r.id}">
      <div class="rc-top" style="background:${esc(r.color||'#2C2819')}">
        <span class="rc-cat">${esc((r.category_label||'').split(' ')[0])}</span>
        <span class="rc-rating"><span class="rc-star">★</span> ${r.rating?(+r.rating).toFixed(1).replace('.',','):'—'}</span>
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
  </div>
</section>` : ''}

</main>`;
  }

  /* ============================================================
     SESSION PICKER
  ============================================================ */
  function initSessionPicker(byLoc, locKeys, course) {
    if (!locKeys.length) return;

    const tabs    = document.querySelectorAll('.loc-tab');
    const list    = document.getElementById('session-list');
    const sumLoc  = document.getElementById('sum-loc');
    const sumDate = document.getElementById('sum-date');
    const sumFmt  = document.getElementById('sum-format');
    const scarc   = document.getElementById('sum-scarcity');
    const sbSub   = document.getElementById('sb-sub');

    function setScarcity(seats) {
      if (!scarc) return;
      if (seats != null && seats <= 6) {
        scarc.innerHTML = `<span class="sc-dot"></span>Kun ${seats} pladser tilbage på dette hold`;
        scarc.hidden = false;
      } else { scarc.hidden = true; }
    }

    function pickSession(card) {
      document.querySelectorAll('.session').forEach(s => s.setAttribute('aria-selected', 'false'));
      card.setAttribute('aria-selected', 'true');
      const dt = card.dataset;
      selectedSession = { id: +dt.id, date: dt.date, location: dt.loc, format: dt.format };
      if (sumLoc)  sumLoc.textContent  = dt.loc;
      if (sumDate) sumDate.textContent = fmtDateFull(dt.date);
      if (sumFmt)  sumFmt.textContent  = dt.format;
      if (sbSub)   sbSub.textContent   = `${dt.loc} · ${fmtDateFull(dt.date)}`;
      setScarcity(dt.seats ? +dt.seats : null);
    }

    function renderLoc(locKey) {
      const sessions = byLoc[locKey] || [];
      if (!list) return;
      list.innerHTML = '';
      sessions.forEach((s, i) => {
        const d = new Date(s.date);
        const day = String(d.getDate()).padStart(2,'0');
        const mon = M_ABBR[d.getMonth()];
        const seatTxt = s.seats <= 4
          ? `<span class="low">Kun ${s.seats} pladser</span>`
          : `<b>${s.seats}</b> pladser`;
        const popTag = s.is_popular ? `<span class="session-pop">Populært</span>` : '';
        const el = document.createElement('div');
        el.className = 'session';
        el.setAttribute('role', 'button');
        el.setAttribute('aria-selected', i===0 ? 'true' : 'false');
        el.dataset.id     = s.id;
        el.dataset.date   = s.date;
        el.dataset.loc    = s.location;
        el.dataset.format = s.format;
        el.dataset.seats  = s.seats;
        el.dataset.online = String(!!s.is_online);
        el.innerHTML = `
          <div class="session-date"><div class="d">${day}</div><div class="m">${mon}</div></div>
          <div class="session-main">
            <div class="sloc">${esc(s.venue || s.location)} ${popTag}</div>
            <div class="smeta"><span>${esc(s.location)}</span><span>09:00–16:00</span></div>
          </div>
          <span class="session-format${s.is_online?' online':''}">${s.is_online?'Online':'Fysisk'}</span>
          <div class="session-seats">${seatTxt}</div>
          <span class="session-radio"></span>`;
        el.addEventListener('click', () => pickSession(el));
        list.appendChild(el);
      });
      const first = list.querySelector('.session');
      if (first) pickSession(first);
    }

    tabs.forEach(t => {
      t.addEventListener('click', () => {
        tabs.forEach(x => x.setAttribute('aria-selected', 'false'));
        t.setAttribute('aria-selected', 'true');
        renderLoc(t.dataset.loc);
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

    function openModal() {
      // Populate summary
      document.getElementById('bm-sum-title').textContent = course.title;
      const meta = selectedSession
        ? `${selectedSession.location} · ${fmtDateFull(selectedSession.date)} · ${selectedSession.format}`
        : 'Vælg dato i sessionsplanlæggeren';
      document.getElementById('bm-sum-meta').textContent = meta;
      document.getElementById('bm-sum-price').textContent = fmtPrice(course.price, course.badge) + ' ekskl. moms';

      formStep.hidden    = false;
      successStep.hidden = true;
      overlay.hidden     = false;
      document.body.style.overflow = 'hidden';
      document.getElementById('bm-name')?.focus();
    }

    function closeModal() {
      overlay.hidden = true;
      document.body.style.overflow = '';
    }

    // Open triggers
    document.getElementById('booking-cta')?.addEventListener('click', openModal);
    document.getElementById('firma-book-btn')?.addEventListener('click', openModal);
    document.querySelector('#stickybar .sb-btn')?.addEventListener('click', openModal);

    // Close triggers
    document.getElementById('bm-close')?.addEventListener('click', closeModal);
    document.querySelectorAll('.bm-close-success').forEach(b => b.addEventListener('click', closeModal));
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeModal(); });

    // Submit
    submitBtn?.addEventListener('click', async () => {
      const name  = document.getElementById('bm-name')?.value.trim();
      const email = document.getElementById('bm-email')?.value.trim();

      if (!name)  { document.getElementById('bm-name').style.borderColor  = 'var(--accent)'; document.getElementById('bm-name').focus(); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        document.getElementById('bm-email').style.borderColor = 'var(--accent)';
        document.getElementById('bm-email').focus(); return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Sender…</span>';

      const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || 'faktura';
      const participants  = parseInt(document.getElementById('bm-participants')?.value) || 1;

      try {
        const body = {
          session_id:       selectedSession?.id || null,
          customer_name:    name,
          customer_email:   email,
          customer_company: document.getElementById('bm-company')?.value.trim() || '',
          customer_phone:   document.getElementById('bm-phone')?.value.trim() || '',
          participants,
          payment_method:   paymentMethod,
          status:           'pending',
        };

        const res  = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Booking fejlede');

        // Show success
        document.getElementById('bm-confirm-email').textContent = email;
        document.getElementById('bm-ref-num').textContent = 'FM-' + String(data.id).padStart(4, '0');
        formStep.hidden    = true;
        successStep.hidden = false;

      } catch (e) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Reservér plads <span class="arrow">→</span>';
        alert('Der opstod en fejl: ' + e.message + '\nPrøv igen eller ring til os.');
      }
    });

    // Reset field borders on input
    document.getElementById('bm-name')?.addEventListener('input', function(){ this.style.borderColor=''; });
    document.getElementById('bm-email')?.addEventListener('input', function(){ this.style.borderColor=''; });
  }

  /* ============================================================
     NOTIFY FORM (email capture)
  ============================================================ */
  document.getElementById('notify-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const input = this.querySelector('input[type="email"]');
    const btn   = this.querySelector('button');
    if (!input || !input.value.trim()) return;
    btn.textContent = 'Gemmer…';
    btn.disabled = true;
    // In production this would POST to a mailing list endpoint
    await new Promise(r => setTimeout(r, 600));
    this.innerHTML = '<div style="font-size:14px;font-weight:600;color:var(--accent-deep);padding:12px 0">✓ Du er tilmeldt. Vi giver besked!</div>';
  });

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
