/* ============================================================
   FUTUREMATCH ADMIN — admin.js
   Single-page admin application
   ============================================================ */
(function () {
  'use strict';

  const API = '/api';
  const content = document.getElementById('content');

  /* ============ ADMIN TOKEN ============ */
  let adminToken = localStorage.getItem('fm_admin_token') || '';
  function setToken(t) { adminToken = t || ''; localStorage.setItem('fm_admin_token', adminToken); }
  function clearToken() { adminToken = ''; localStorage.removeItem('fm_admin_token'); }

  /* ============ API WRAPPER ============ */
  async function api(path, opts = {}) {
    const { headers: optHeaders, ...rest } = opts;
    const res = await fetch(API + path, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { Authorization: 'Bearer ' + adminToken } : {}),
        ...(optHeaders || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      clearToken();
      showLogin('Forkert eller udløbet adgangstoken. Prøv igen.');
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /* ============ TOAST ============ */
  const toastContainer = document.getElementById('toast-container');
  function toast(msg, type = 'success') {
    const icons = {
      success: '<path d="M20 6 9 17l-5-5"/>',
      error:   '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      info:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[type] || icons.info}</svg><span>${msg}</span>`;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  /* ============ CONFIRM DIALOG ============ */
  function confirm(title, message) {
    return new Promise(resolve => {
      const overlay = document.getElementById('confirm-overlay');
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      overlay.hidden = false;
      const ok = document.getElementById('confirm-ok');
      const cancel = document.getElementById('confirm-cancel');
      function cleanup(result) {
        overlay.hidden = true;
        ok.onclick = null; cancel.onclick = null;
        resolve(result);
      }
      ok.onclick = () => cleanup(true);
      cancel.onclick = () => cleanup(false);
    });
  }

  /* ============ MODAL ============ */
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle   = document.getElementById('modal-title');
  const modalBody    = document.getElementById('modal-body');
  const modalFooter  = document.getElementById('modal-footer');

  function openModal(title, bodyHTML, footerHTML = '') {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    modalFooter.innerHTML = footerHTML;
    modalOverlay.hidden = false;
    document.getElementById('modal-close').onclick = closeModal;
    modalOverlay.onclick = e => { if (e.target === modalOverlay) closeModal(); };
    const first = modalBody.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  function closeModal() {
    modalOverlay.hidden = true;
    modalBody.innerHTML = '';
    modalFooter.innerHTML = '';
  }

  /* ============ NAVIGATION ============ */
  let currentPage = '';

  function navigate(page) {
    if (!page || !PAGES[page]) page = 'dashboard';
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    content.innerHTML = '<div class="content-loader"><div class="loader-spinner"></div></div>';
    PAGES[page]();
  }

  /* ============ FORMAT HELPERS ============ */
  function fmtPrice(price, badge) {
    if (badge === 'amu' || price === 0) return '<span class="price-free">Gratis*</span>';
    return '<span class="price-display">kr. ' + price.toLocaleString('da-DK') + '</span>';
  }

  function fmtRating(rating, reviews) {
    if (!rating) return '—';
    return `<span class="rating-display"><span class="rating-star">★</span>${(+rating).toFixed(1)} <span style="color:var(--muted);font-weight:400">(${(reviews||0).toLocaleString('da-DK')})</span></span>`;
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function statusBadge(status) {
    const map = {
      active: 'active', draft: 'draft', archived: 'archived',
      pending: 'pending', confirmed: 'confirmed', cancelled: 'cancelled',
      inactive: 'inactive', full: 'pending',
    };
    const labels = {
      active:'Aktiv', draft:'Kladde', archived:'Arkiveret',
      pending:'Afventer', confirmed:'Bekræftet', cancelled:'Annulleret',
      inactive:'Inaktiv', full:'Udsolgt',
    };
    const cls = map[status] || 'draft';
    return `<span class="badge badge-${cls}"><span class="badge-dot"></span>${labels[status] || status}</span>`;
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ============ DYNAMIC LIST ============ */
  function dynamicList(id, values = [], placeholder = 'Tilføj punkt...', multiline = false) {
    const tag = multiline ? 'textarea' : 'input';
    const extra = multiline ? ' rows="2"' : ' type="text"';
    function itemHTML(val) {
      return `<div class="dynamic-item">
        ${tag === 'textarea'
          ? `<textarea class="form-textarea" name="${id}[]" placeholder="${placeholder}"${extra} style="min-height:60px">${escHtml(val)}</textarea>`
          : `<input class="form-input" name="${id}[]" placeholder="${placeholder}" value="${escHtml(val)}">`}
        <button type="button" class="btn-remove-item" title="Fjern">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    }
    const listId = id + '-list';
    return `<div class="dynamic-list" id="${listId}">
      ${values.map(itemHTML).join('')}
    </div>
    <button type="button" class="btn-add-item" data-list="${listId}" data-id="${id}" data-placeholder="${placeholder}" data-multiline="${multiline}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Tilføj
    </button>`;
  }

  function getListValues(id) {
    return Array.from(document.querySelectorAll(`[name="${id}[]"]`))
      .map(el => el.value.trim())
      .filter(Boolean);
  }

  function bindDynamicLists(container = document) {
    container.querySelectorAll('.btn-add-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const listEl = document.getElementById(btn.dataset.list);
        const id = btn.dataset.id;
        const ph = btn.dataset.placeholder;
        const ml = btn.dataset.multiline === 'true';
        const div = document.createElement('div');
        div.className = 'dynamic-item';
        if (ml) {
          div.innerHTML = `<textarea class="form-textarea" name="${id}[]" placeholder="${ph}" rows="2" style="min-height:60px"></textarea>
            <button type="button" class="btn-remove-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
        } else {
          div.innerHTML = `<input class="form-input" name="${id}[]" placeholder="${ph}">
            <button type="button" class="btn-remove-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
        }
        listEl.appendChild(div);
        div.querySelector('input,textarea').focus();
        bindRemoveItems(div);
      });
    });
    bindRemoveItems(container);
  }

  function bindRemoveItems(container) {
    container.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.dynamic-item').remove());
    });
  }

  /* ============ PHASE EDITOR ============ */
  function phaseEditor(phases = []) {
    function phaseHTML(ph, idx) {
      const items = (ph.items || []).join('\n');
      return `<div class="phase-edit-block" data-idx="${idx}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <input class="form-input phase-tag" placeholder="Mærke (f.eks. Akt 1)" value="${escHtml(ph.tag||'')}" style="flex:0 0 110px">
          <input class="form-input phase-label" placeholder="Navn (f.eks. Før)" value="${escHtml(ph.label||'')}" style="flex:1">
          <button type="button" class="btn-remove-item btn-remove-phase">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <textarea class="form-textarea phase-items" placeholder="Ét punkt per linje..." rows="3" style="min-height:72px">${escHtml(items)}</textarea>
      </div>`;
    }
    const id = 'phases-wrap';
    return `<div id="${id}" style="display:flex;flex-direction:column;gap:12px">
      ${phases.map((ph, i) => phaseHTML(ph, i)).join('')}
    </div>
    <button type="button" class="btn-add-item" id="add-phase-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Tilføj fase
    </button>`;
  }

  function bindPhaseEditor() {
    document.getElementById('add-phase-btn')?.addEventListener('click', () => {
      const wrap = document.getElementById('phases-wrap');
      const idx = wrap.children.length;
      const div = document.createElement('div');
      div.className = 'phase-edit-block';
      div.dataset.idx = idx;
      div.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <input class="form-input phase-tag" placeholder="Mærke (f.eks. Akt 1)" style="flex:0 0 110px">
        <input class="form-input phase-label" placeholder="Navn (f.eks. Før)" style="flex:1">
        <button type="button" class="btn-remove-item btn-remove-phase">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <textarea class="form-textarea phase-items" placeholder="Ét punkt per linje..." rows="3" style="min-height:72px"></textarea>`;
      wrap.appendChild(div);
      div.querySelector('input').focus();
      div.querySelector('.btn-remove-phase').addEventListener('click', () => div.remove());
    });
    document.querySelectorAll('.btn-remove-phase').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.phase-edit-block').remove());
    });
  }

  function getPhases() {
    return Array.from(document.querySelectorAll('.phase-edit-block')).map(block => ({
      tag:   block.querySelector('.phase-tag').value.trim(),
      label: block.querySelector('.phase-label').value.trim(),
      items: block.querySelector('.phase-items').value.split('\n').map(s=>s.trim()).filter(Boolean),
    })).filter(ph => ph.label);
  }

  /* ============ TABS ============ */
  function bindTabs(container = document) {
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.tab-nav').dataset.group;
        document.querySelectorAll(`[data-group="${group}"] .tab-btn`).forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`[data-tabgroup="${group}"] .tab-panel`).forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(btn.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    });
  }

  /* ============================================================
     PAGE: DASHBOARD
  ============================================================ */
  async function renderDashboard() {
    const stats = await api('/bookings/stats/summary');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Dashboard</h1>
          <div class="page-header-sub">Futurematch kursusmarkedsplads</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-accent" onclick="document.location.hash='courses'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nyt kursus
          </button>
        </div>
      </div>
      <div class="page-body">
        <div class="stats-grid">
          <div class="stat-card accent">
            <div class="stat-label">Aktive kurser</div>
            <div class="stat-value">${stats.total_courses}</div>
            <div class="stat-sub">${stats.draft_courses} kladder</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Leverandører</div>
            <div class="stat-value">${stats.total_suppliers}</div>
            <div class="stat-sub">Aktive udbydere</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Aktive hold</div>
            <div class="stat-value">${stats.total_sessions}</div>
            <div class="stat-sub">Kommende datoer</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Bookinger</div>
            <div class="stat-value">${stats.total_bookings}</div>
            <div class="stat-sub">${stats.pending_bookings} afventer · ${stats.confirmed_bookings} bekræftet</div>
          </div>
        </div>

        <div class="dash-grid">
          <div class="dash-card">
            <div class="dash-card-head">
              <h3>Seneste kurser</h3>
              <a href="#courses" class="btn btn-sm btn-ghost">Se alle</a>
            </div>
            <table class="dash-table">
              <thead><tr><th>Titel</th><th>Leverandør</th><th>Pris</th><th>Status</th></tr></thead>
              <tbody>
                ${stats.recent_courses.map(c => `
                  <tr>
                    <td><div class="td-title">${escHtml(c.title)}</div><div class="td-sub">${escHtml(c.category_label||'')}</div></td>
                    <td style="font-size:13px;color:var(--muted)">${escHtml(c.supplier_name||'—')}</td>
                    <td>${fmtPrice(c.price, c.badge)}</td>
                    <td>${statusBadge(c.status)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>

          <div class="dash-card">
            <div class="dash-card-head">
              <h3>Seneste bookinger</h3>
              <a href="#bookings" class="btn btn-sm btn-ghost">Se alle</a>
            </div>
            <table class="dash-table">
              <thead><tr><th>Kunde</th><th>Kursus</th><th>Status</th></tr></thead>
              <tbody>
                ${stats.recent_bookings.map(b => `
                  <tr>
                    <td><div class="td-title">${escHtml(b.customer_name)}</div><div class="td-sub">${escHtml(b.customer_company||b.customer_email)}</div></td>
                    <td style="font-size:13px;color:var(--muted)">${escHtml(b.course_title||'—')}</td>
                    <td>${statusBadge(b.status)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    // Update nav badges
    document.getElementById('badge-courses').textContent = stats.total_courses;
    document.getElementById('badge-suppliers').textContent = stats.total_suppliers;
    if (stats.pending_bookings > 0) {
      document.getElementById('badge-bookings').textContent = stats.pending_bookings;
    }
    const inqBadge = document.getElementById('badge-inquiries');
    if (inqBadge) inqBadge.textContent = stats.new_inquiries > 0 ? stats.new_inquiries : '';
  }

  /* ============================================================
     PAGE: COURSES
  ============================================================ */
  let courseFilter = 'alle';

  async function renderCourses() {
    const [courses, suppliers, categories] = await Promise.all([
      api('/courses'), api('/suppliers'), api('/categories'),
    ]);

    const filtered = courseFilter === 'alle' ? courses
      : courses.filter(c => c.status === courseFilter);

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Kurser</h1>
          <div class="page-header-sub">${courses.length} kurser i kataloget</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-accent" id="add-course-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nyt kursus
          </button>
        </div>
      </div>
      <div class="page-body">
        <div class="toolbar">
          <div class="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="course-search" type="text" placeholder="Søg i kurser...">
          </div>
          <div class="filter-chips">
            <button class="chip ${courseFilter==='alle'?'active':''}" data-filter="alle">Alle</button>
            <button class="chip ${courseFilter==='active'?'active':''}" data-filter="active">Aktive</button>
            <button class="chip ${courseFilter==='draft'?'active':''}" data-filter="draft">Kladder</button>
            <button class="chip ${courseFilter==='archived'?'active':''}" data-filter="archived">Arkiverede</button>
          </div>
        </div>

        ${filtered.length === 0
          ? `<div class="empty-state">
              <div class="es-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
              <h3>Ingen kurser endnu</h3>
              <p>Tilføj dit første kursus ved at klikke "Nyt kursus".</p>
            </div>`
          : `<div class="table-wrap">
            <table id="courses-table">
              <thead><tr>
                <th>Kursus</th><th>Leverandør</th><th>Kategori</th>
                <th>Pris</th><th>Format</th><th>Næste hold</th><th>Rating</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                ${filtered.map(c => {
                  const upcoming = Number(c.upcoming_session_count || 0);
                  const seats = c.next_session_seats_remaining == null ? null : Number(c.next_session_seats_remaining);
                  const nextMeta = c.next_session_date
                    ? `<div class="td-title">${fmtDate(c.next_session_date)}</div><div class="td-sub">${upcoming} kommende hold${seats != null && seats <= 4 ? ' · ' + seats + ' pladser på næste' : ''}</div>`
                    : '<div class="td-sub">Mangler datoer</div>';
                  return `
                  <tr data-search="${escHtml([c.title, c.supplier_name, c.category_label, c.status].join(' ').toLowerCase())}">
                    <td>
                      <div class="td-title">${escHtml(c.title)}</div>
                      <div class="td-sub">${escHtml(c.duration||'')}${c.is_online?' · Online':''}</div>
                    </td>
                    <td>
                      <div class="supplier-cell">
                        <div class="supplier-avatar">${escHtml(c.supplier_abbr||'?')}</div>
                        <span style="font-size:13px">${escHtml(c.supplier_name||'—')}</span>
                      </div>
                    </td>
                    <td>
                      ${c.category_label
                        ? `<span class="pill" style="background:${escHtml(c.category_accent||'#eee')}22;color:${escHtml(c.category_accent||'#333')}">${escHtml(c.category_label.split(' ')[0])}</span>`
                        : '—'}
                    </td>
                    <td>${fmtPrice(c.price, c.badge)}</td>
                    <td style="font-size:13px;color:var(--muted)">${escHtml(c.format||'')}</td>
                    <td>${nextMeta}</td>
                    <td>${fmtRating(c.rating, c.review_count)}</td>
                    <td>${statusBadge(c.status)}</td>
                    <td>
                      <div class="td-actions">
                        <button class="btn-icon btn-sessions" data-id="${c.id}" data-title="${escHtml(c.title)}" title="Hold & datoer">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </button>
                        <button class="btn-icon btn-edit-course" data-id="${c.id}" title="Rediger">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-icon btn-delete-course" data-id="${c.id}" data-title="${escHtml(c.title)}" title="Slet">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`
        }
      </div>`;

    // Search
    document.getElementById('course-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#courses-table tbody tr').forEach(row => {
        row.style.display = !q || (row.dataset.search||'').includes(q) ? '' : 'none';
      });
    });

    // Filter chips
    document.querySelectorAll('.chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        courseFilter = chip.dataset.filter;
        renderCourses();
      });
    });

    // Edit course
    document.querySelectorAll('.btn-edit-course').forEach(btn => {
      btn.addEventListener('click', () => openCourseForm(btn.dataset.id, suppliers, categories));
    });

    // Sessions shortcut
    document.querySelectorAll('.btn-sessions').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = 'sessions';
        sessionPreselect = btn.dataset.id;
      });
    });

    // Delete course
    document.querySelectorAll('.btn-delete-course').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirm('Slet kursus', `Vil du slette "${btn.dataset.title}"? Hold og bookinger slettes også.`)) return;
        try {
          await api('/courses/' + btn.dataset.id, { method: 'DELETE' });
          toast('Kursus slettet');
          renderCourses();
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    // Add course
    document.getElementById('add-course-btn')?.addEventListener('click', () => openCourseForm(null, suppliers, categories));
    document.getElementById('badge-courses').textContent = courses.length;
  }

  async function openCourseForm(id, suppliers, categories) {
    const isEdit = !!id;
    let course = {};
    if (isEdit) {
      try { course = await api('/courses/' + id); } catch (e) { toast(e.message, 'error'); return; }
    }

    const outcomes = Array.isArray(course.outcomes) ? course.outcomes : [];
    const included = Array.isArray(course.included) ? course.included : [];
    const marquee  = Array.isArray(course.marquee_items) ? course.marquee_items : [];
    const phases   = Array.isArray(course.curriculum) ? course.curriculum : [];
    const facts    = Array.isArray(course.facts) ? course.facts : [{k:'Varighed',v:'1 dag',s:''},{k:'Niveau',v:'Alle',s:''},{k:'Format',v:'Fysisk',s:''},{k:'Deltagere',v:'Maks 14',s:''}];

    const supOpts = suppliers.map(s => `<option value="${s.id}" ${s.id==course.supplier_id?'selected':''}>${escHtml(s.name)}</option>`).join('');
    const catOpts = categories.map(c => `<option value="${c.id}" ${c.id==course.category_id?'selected':''}>${escHtml(c.label)}</option>`).join('');

    const presets = ['ledelse','it','cert','sundhed','amu'];
    const presetOpts = presets.map(p => `<option value="${p}" ${p==course.preset_type?'selected':''}>${p}</option>`).join('');

    const factsHTML = facts.map((f,i) => `
      <div class="form-row" style="gap:8px;margin-bottom:8px">
        <input class="form-input" name="fact_k_${i}" placeholder="Nøgle" value="${escHtml(f.k||'')}" style="flex:0 0 130px">
        <input class="form-input" name="fact_v_${i}" placeholder="Værdi" value="${escHtml(f.v||'')}" style="flex:1">
        <input class="form-input" name="fact_s_${i}" placeholder="Undertekst" value="${escHtml(f.s||'')}" style="flex:1">
      </div>`).join('');

    openModal(isEdit ? `Rediger kursus` : 'Nyt kursus', `
      <div class="tab-nav" data-group="course-form">
        <button class="tab-btn active" data-tab="tab-basic">Grundinfo</button>
        <button class="tab-btn" data-tab="tab-content">Indhold</button>
        <button class="tab-btn" data-tab="tab-pricing">Pris & Format</button>
      </div>
      <div data-tabgroup="course-form">
        <div class="tab-panel active" id="tab-basic">
          <div class="form-grid">
            <div class="form-group form-col-full">
              <label class="form-label">Titel <span class="req">*</span></label>
              <input class="form-input" id="f-title" value="${escHtml(course.title||'')}" placeholder="Kursustitel" required>
            </div>
            <div class="form-group">
              <label class="form-label">Leverandør</label>
              <select class="form-select" id="f-supplier"><option value="">— Vælg leverandør —</option>${supOpts}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Kategori</label>
              <select class="form-select" id="f-category"><option value="">— Vælg kategori —</option>${catOpts}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Format</label>
              <select class="form-select" id="f-format">
                ${['Fysisk','Online','Begge'].map(f=>`<option ${f==course.format?'selected':''}>${f}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Varighed</label>
              <input class="form-input" id="f-duration" value="${escHtml(course.duration||'1 dag')}" placeholder="f.eks. 1 dag, 2 dage, 3 dage + eksamen">
            </div>
            <div class="form-group form-col-full">
              <label class="form-check">
                <input type="checkbox" id="f-online" ${course.is_online?'checked':''}>
                Online-hold tilgængeligt (vises i filteret)
              </label>
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-select" id="f-status">
                ${['active','draft','archived'].map(s=>`<option value="${s}" ${s==course.status?'selected':''}>${{active:'Aktiv',draft:'Kladde',archived:'Arkiveret'}[s]}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Badge</label>
              <select class="form-select" id="f-badge">
                ${[['','Ingen'],['amu','AMU-finansieret'],['cert','Eksamen inkluderet']].map(([v,l])=>`<option value="${v}" ${v==course.badge?'selected':''}>${l}</option>`).join('')}
              </select>
            </div>
            <div class="form-group form-col-full">
              <label class="form-label">Kort beskrivelse</label>
              <textarea class="form-textarea" id="f-short-desc" placeholder="En linje der vises på kort og i søgning...">${escHtml(course.short_description||'')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Rating</label>
              <input class="form-input" id="f-rating" type="number" min="0" max="5" step="0.1" value="${course.rating||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Antal anmeldelser</label>
              <input class="form-input" id="f-reviews" type="number" min="0" value="${course.review_count||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Baggrundsfarve (kort)</label>
              <div class="color-field">
                <div class="color-preview" style="background:${escHtml(course.color||'#2C1A0A')}">
                  <input type="color" id="f-color" value="${escHtml(course.color||'#2C1A0A')}" oninput="this.closest('.color-preview').style.background=this.value">
                </div>
                <input class="form-input" id="f-color-text" value="${escHtml(course.color||'#2C1A0A')}" placeholder="#2C1A0A" style="flex:1">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Preset type</label>
              <select class="form-select" id="f-preset">${presetOpts}</select>
            </div>
          </div>
        </div>

        <div class="tab-panel" id="tab-content">
          <div class="form-grid">
            <div class="form-group form-col-full">
              <label class="form-label">Beskrivelse (fuld)</label>
              <textarea class="form-textarea" id="f-desc" rows="4" placeholder="Fuld kursusbeskrivelse...">${escHtml(course.description||'')}</textarea>
            </div>
            <div class="form-group form-col-full">
              <label class="form-label">Udbytte (hvad får deltagerne ud af kurset)</label>
              <div class="form-hint">Op til 3 punkter anbefales</div>
              ${dynamicList('outcomes', outcomes, 'Beskriv et læringsmål...')}
            </div>
            <div class="form-group form-col-full">
              <label class="form-label">Hvad er inkluderet (booking-modul)</label>
              ${dynamicList('included', included, 'f.eks. Kursusbevis')}
            </div>
            <div class="form-group form-col-full">
              <label class="form-label">Markeringsord (løbende tekst under hero)</label>
              ${dynamicList('marquee_items', marquee, 'f.eks. Win-win resultater')}
            </div>
            <div class="form-group form-col-full">
              <label class="form-label">Fakta-grid (4 felter under hero)</label>
              <div class="form-hint">Nøgle · Værdi · Undertekst (valgfri)</div>
              <div id="facts-wrap">${factsHTML}</div>
            </div>
            <div class="form-group form-col-full">
              <label class="form-label">Kursusindhold — faser</label>
              <div class="form-hint">Klik "Tilføj fase" for at bygge curriculum op</div>
              ${phaseEditor(phases)}
            </div>
          </div>
        </div>

        <div class="tab-panel" id="tab-pricing">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Pris (ekskl. moms)</label>
              <div class="price-input-wrap">
                <input class="form-input" id="f-price" type="number" min="0" value="${course.price||0}" placeholder="6900">
              </div>
              <div class="form-hint">0 for gratis / AMU-kurser</div>
            </div>
            <div class="form-group">
              <label class="form-label">Prislabel</label>
              <input class="form-input" id="f-price-label" value="${escHtml(course.price_label||'Pris ekskl. moms')}" placeholder="Pris ekskl. moms">
            </div>
            <div class="form-group form-col-full">
              <label class="form-label">Prisnote (under prisen)</label>
              <input class="form-input" id="f-price-note" value="${escHtml(course.price_note||'')}" placeholder="f.eks. Materialer, forplejning & kursusbevis inkluderet">
            </div>
          </div>
        </div>
      </div>`,

      `<button class="btn btn-ghost" id="cancel-course-form">Annuller</button>
       <button class="btn btn-accent" id="save-course-form">${isEdit?'Gem ændringer':'Opret kursus'}</button>`
    );

    bindTabs(document);
    bindDynamicLists(modalBody);
    bindPhaseEditor();

    // Color sync
    document.getElementById('f-color')?.addEventListener('input', e => {
      document.getElementById('f-color-text').value = e.target.value;
    });
    document.getElementById('f-color-text')?.addEventListener('input', e => {
      const col = e.target.value;
      if (/^#[0-9a-fA-F]{6}$/.test(col)) {
        document.getElementById('f-color').value = col;
        document.querySelector('#f-color')?.closest('.color-preview')?.style.setProperty('background', col);
      }
    });

    document.getElementById('cancel-course-form').onclick = closeModal;
    document.getElementById('save-course-form').onclick = async () => {
      const title = document.getElementById('f-title').value.trim();
      if (!title) { toast('Titel er påkrævet', 'error'); return; }

      const facts = [];
      for (let i = 0; i < 4; i++) {
        const k = document.querySelector(`[name="fact_k_${i}"]`)?.value.trim();
        const v = document.querySelector(`[name="fact_v_${i}"]`)?.value.trim();
        const s = document.querySelector(`[name="fact_s_${i}"]`)?.value.trim();
        if (k && v) facts.push({ k, v, s: s || '' });
      }

      const body = {
        title,
        supplier_id: document.getElementById('f-supplier').value || null,
        category_id: document.getElementById('f-category').value || null,
        format: document.getElementById('f-format').value,
        duration: document.getElementById('f-duration').value.trim(),
        is_online: document.getElementById('f-online').checked,
        status: document.getElementById('f-status').value,
        badge: document.getElementById('f-badge').value,
        short_description: document.getElementById('f-short-desc').value.trim(),
        description: document.getElementById('f-desc').value.trim(),
        rating: parseFloat(document.getElementById('f-rating').value) || 0,
        review_count: parseInt(document.getElementById('f-reviews').value) || 0,
        color: document.getElementById('f-color').value,
        preset_type: document.getElementById('f-preset').value,
        price: parseInt(document.getElementById('f-price').value) || 0,
        price_label: document.getElementById('f-price-label').value.trim(),
        price_note: document.getElementById('f-price-note').value.trim(),
        outcomes: getListValues('outcomes'),
        included: getListValues('included'),
        marquee_items: getListValues('marquee_items'),
        curriculum: getPhases(),
        facts,
      };

      try {
        const btn = document.getElementById('save-course-form');
        btn.textContent = 'Gemmer...';
        btn.disabled = true;
        if (isEdit) {
          await api('/courses/' + id, { method: 'PUT', body });
          toast('Kursus opdateret');
        } else {
          await api('/courses', { method: 'POST', body });
          toast('Kursus oprettet');
        }
        closeModal();
        renderCourses();
      } catch (e) {
        toast(e.message, 'error');
        const btn = document.getElementById('save-course-form');
        if (btn) { btn.textContent = isEdit ? 'Gem ændringer' : 'Opret kursus'; btn.disabled = false; }
      }
    };
  }

  /* ============================================================
     PAGE: SUPPLIERS
  ============================================================ */
  async function renderSuppliers() {
    const suppliers = await api('/suppliers');

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Leverandører</h1>
          <div class="page-header-sub">${suppliers.length} udbydere registreret</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-accent" id="add-supplier-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ny leverandør
          </button>
        </div>
      </div>
      <div class="page-body">
        <div class="toolbar">
          <div class="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="sup-search" type="text" placeholder="Søg leverandør...">
          </div>
        </div>
        <div class="table-wrap">
          <table id="suppliers-table">
            <thead><tr>
              <th>Leverandør</th><th>Kontakt</th><th>Telefon</th>
              <th>Kurser</th><th>Rating</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              ${suppliers.map(s => `
                <tr data-name="${escHtml(s.name.toLowerCase())}">
                  <td>
                    <div class="supplier-cell">
                      <div class="supplier-avatar">${escHtml(s.abbr||s.name.slice(0,2).toUpperCase())}</div>
                      <div>
                        <div class="td-title">${escHtml(s.name)}</div>
                        <div class="td-sub">${escHtml(s.website||'')}</div>
                      </div>
                    </div>
                  </td>
                  <td style="font-size:13px;color:var(--muted)">${escHtml(s.email||'—')}</td>
                  <td style="font-size:13px">${escHtml(s.phone||'—')}</td>
                  <td><span class="pill">${s.course_count} kurser</span></td>
                  <td>${s.rating ? fmtRating(s.rating, s.review_count) : '—'}</td>
                  <td>${statusBadge(s.status)}</td>
                  <td>
                    <div class="td-actions">
                      <button class="btn-icon btn-edit-supplier" data-id="${s.id}" title="Rediger">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn-icon btn-delete-supplier" data-id="${s.id}" data-name="${escHtml(s.name)}" title="Slet">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('sup-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#suppliers-table tbody tr').forEach(row => {
        row.style.display = !q || (row.dataset.name||'').includes(q) ? '' : 'none';
      });
    });

    document.querySelectorAll('.btn-edit-supplier').forEach(btn => {
      btn.addEventListener('click', () => openSupplierForm(btn.dataset.id));
    });

    document.querySelectorAll('.btn-delete-supplier').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirm('Slet leverandør', `Slet "${btn.dataset.name}"? Kurser tilknyttet leverandøren bevares men mister leverandørreference.`)) return;
        try {
          await api('/suppliers/' + btn.dataset.id, { method: 'DELETE' });
          toast('Leverandør slettet');
          renderSuppliers();
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    document.getElementById('add-supplier-btn')?.addEventListener('click', () => openSupplierForm(null));
    document.getElementById('badge-suppliers').textContent = suppliers.filter(s=>s.status==='active').length;
  }

  async function openSupplierForm(id) {
    const isEdit = !!id;
    let sup = {};
    if (isEdit) {
      try { sup = await api('/suppliers/' + id); } catch (e) { toast(e.message, 'error'); return; }
    }

    openModal(isEdit ? 'Rediger leverandør' : 'Ny leverandør', `
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Navn <span class="req">*</span></label>
          <input class="form-input" id="sf-name" value="${escHtml(sup.name||'')}" placeholder="Leverandørens navn">
        </div>
        <div class="form-group">
          <label class="form-label">Forkortelse (logo)</label>
          <input class="form-input" id="sf-abbr" value="${escHtml(sup.abbr||'')}" placeholder="f.eks. CW" maxlength="4">
          <div class="form-hint">2-4 bogstaver vist i kursuslisten</div>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="sf-email" type="email" value="${escHtml(sup.email||'')}" placeholder="kurser@udbyder.dk">
        </div>
        <div class="form-group">
          <label class="form-label">Telefon</label>
          <input class="form-input" id="sf-phone" value="${escHtml(sup.phone||'')}" placeholder="77 300 123">
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Hjemmeside</label>
          <input class="form-input" id="sf-website" type="url" value="${escHtml(sup.website||'')}" placeholder="https://leverandor.dk">
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Beskrivelse</label>
          <textarea class="form-textarea" id="sf-desc" placeholder="Kort om leverandøren...">${escHtml(sup.description||'')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Rating</label>
          <input class="form-input" id="sf-rating" type="number" min="0" max="5" step="0.1" value="${sup.rating||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Antal anmeldelser</label>
          <input class="form-input" id="sf-reviews" type="number" min="0" value="${sup.review_count||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="sf-status">
            <option value="active" ${sup.status!=='inactive'?'selected':''}>Aktiv</option>
            <option value="inactive" ${sup.status==='inactive'?'selected':''}>Inaktiv</option>
          </select>
        </div>
      </div>`,

      `<button class="btn btn-ghost" id="cancel-supplier">Annuller</button>
       <button class="btn btn-accent" id="save-supplier">${isEdit?'Gem ændringer':'Opret leverandør'}</button>`
    );

    document.getElementById('cancel-supplier').onclick = closeModal;
    document.getElementById('save-supplier').onclick = async () => {
      const name = document.getElementById('sf-name').value.trim();
      if (!name) { toast('Navn er påkrævet', 'error'); return; }
      const body = {
        name, abbr: document.getElementById('sf-abbr').value.trim(),
        email: document.getElementById('sf-email').value.trim(),
        phone: document.getElementById('sf-phone').value.trim(),
        website: document.getElementById('sf-website').value.trim(),
        description: document.getElementById('sf-desc').value.trim(),
        rating: parseFloat(document.getElementById('sf-rating').value) || 0,
        review_count: parseInt(document.getElementById('sf-reviews').value) || 0,
        status: document.getElementById('sf-status').value,
      };
      try {
        const btn = document.getElementById('save-supplier');
        btn.textContent = 'Gemmer...'; btn.disabled = true;
        if (isEdit) {
          await api('/suppliers/' + id, { method: 'PUT', body });
          toast('Leverandør opdateret');
        } else {
          await api('/suppliers', { method: 'POST', body });
          toast('Leverandør oprettet');
        }
        closeModal(); renderSuppliers();
      } catch (e) {
        toast(e.message, 'error');
        const btn = document.getElementById('save-supplier');
        if (btn) { btn.textContent = isEdit ? 'Gem ændringer' : 'Opret leverandør'; btn.disabled = false; }
      }
    };
  }

  /* ============================================================
     PAGE: CATEGORIES
  ============================================================ */
  async function renderCategories() {
    const cats = await api('/categories');
    const icons = {
      ledelse: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      it:      '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M9 10l2 2 4-4"/>',
      cert:    '<circle cx="12" cy="8" r="6"/><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0L7.81 21.886a.5.5 0 0 1-.81-.47l1.514-8.526"/>',
      sundhed: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
      amu:     '<path d="M2 20h20M4 20V10l8-6 8 6v10M10 20v-6h4v6"/>',
      salg:    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    };

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Kategorier</h1>
          <div class="page-header-sub">Rediger kategoriernes visuelle identitet og beskrivelse</div>
        </div>
      </div>
      <div class="page-body">
        <div class="cat-cards-grid">
          ${cats.map(cat => `
            <div class="cat-admin-card">
              <div class="cat-card-top" style="background:${escHtml(cat.accent)}"></div>
              <div class="cat-card-body">
                <div class="cat-card-head">
                  <div class="cat-badge-icon" style="background:${escHtml(cat.bg||'#111')}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${escHtml(cat.accent)}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      ${icons[cat.key]||'<circle cx="12" cy="12" r="10"/>'}
                    </svg>
                  </div>
                  <button class="btn btn-sm btn-ghost btn-edit-cat" data-id="${cat.id}">Rediger</button>
                </div>
                <h3>${escHtml(cat.label)}</h3>
                <p>${escHtml(cat.description||'')}</p>
                <div class="cat-card-footer">
                  <span class="cat-count">${cat.course_count} kurser</span>
                  <span class="pill" style="background:${escHtml(cat.accent)}22;color:${escHtml(cat.accent)}">${escHtml(cat.key)}</span>
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;

    document.querySelectorAll('.btn-edit-cat').forEach(btn => {
      btn.addEventListener('click', () => openCategoryForm(btn.dataset.id, cats));
    });
  }

  async function openCategoryForm(id, cats) {
    const cat = cats.find(c => c.id == id);
    if (!cat) return;

    openModal('Rediger kategori', `
      <div class="form-grid">
        <div class="form-group form-col-full">
          <label class="form-label">Label / Navn</label>
          <input class="form-input" id="cf-label" value="${escHtml(cat.label)}">
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Beskrivelse</label>
          <textarea class="form-textarea" id="cf-desc">${escHtml(cat.description||'')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Accentfarve</label>
          <div class="color-field">
            <div class="color-preview" style="background:${escHtml(cat.accent)}">
              <input type="color" id="cf-accent" value="${escHtml(cat.accent)}" oninput="this.closest('.color-preview').style.background=this.value;document.getElementById('cf-accent-text').value=this.value">
            </div>
            <input class="form-input" id="cf-accent-text" value="${escHtml(cat.accent)}" style="flex:1">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Baggrundsfarve (hero)</label>
          <div class="color-field">
            <div class="color-preview" style="background:${escHtml(cat.bg||'#111')}">
              <input type="color" id="cf-bg" value="${escHtml(cat.bg||'#111111')}" oninput="this.closest('.color-preview').style.background=this.value;document.getElementById('cf-bg-text').value=this.value">
            </div>
            <input class="form-input" id="cf-bg-text" value="${escHtml(cat.bg||'')}" style="flex:1">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Sorteringsorden</label>
          <input class="form-input" id="cf-sort" type="number" min="0" value="${cat.sort_order||0}">
        </div>
      </div>`,

      `<button class="btn btn-ghost" id="cancel-cat">Annuller</button>
       <button class="btn btn-accent" id="save-cat">Gem ændringer</button>`
    );

    document.getElementById('cancel-cat').onclick = closeModal;
    document.getElementById('save-cat').onclick = async () => {
      const body = {
        label: document.getElementById('cf-label').value.trim(),
        description: document.getElementById('cf-desc').value.trim(),
        accent: document.getElementById('cf-accent').value,
        bg: document.getElementById('cf-bg').value,
        sort_order: parseInt(document.getElementById('cf-sort').value) || 0,
      };
      try {
        await api('/categories/' + id, { method: 'PUT', body });
        toast('Kategori opdateret');
        closeModal();
        renderCategories();
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  /* ============================================================
     PAGE: SESSIONS (HOLD & DATOER)
  ============================================================ */
  let sessionPreselect = null;

  async function renderSessions() {
    const [courses, sessions] = await Promise.all([api('/courses'), api('/sessions')]);
    const activeCourses = courses.filter(c => c.status !== 'archived');

    const preId = sessionPreselect;
    sessionPreselect = null;
    const selectedCourse = preId ? activeCourses.find(c => c.id == preId) : activeCourses[0];
    const selId = selectedCourse ? selectedCourse.id : '';
    const filteredSessions = selId ? sessions.filter(s => s.course_id == selId) : [];

    const DA_MONTHS = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Hold & Datoer</h1>
          <div class="page-header-sub">Administrer kursushold og tilgængelige datoer</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-accent" id="add-session-btn" ${!selId?'disabled':''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nyt hold
          </button>
        </div>
      </div>
      <div class="page-body">
        <div class="course-selector">
          <label>Kursus:</label>
          <select id="session-course-picker">
            ${activeCourses.map(c => `<option value="${c.id}" ${c.id==selId?'selected':''}>${escHtml(c.title)}</option>`).join('')}
          </select>
        </div>

        ${filteredSessions.length === 0
          ? `<div class="empty-state">
              <div class="es-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
              <h3>Ingen hold oprettet endnu</h3>
              <p>Klik "Nyt hold" for at tilføje kursusdatoer til dette kursus.</p>
            </div>`
          : `<div class="session-list-admin" id="sessions-list">
              ${filteredSessions.map(s => {
                const d = new Date(s.date);
                const day = d.getDate();
                const mon = DA_MONTHS[d.getMonth()];
                const cap = s.seats;
                const remaining = (s.seats_remaining != null) ? s.seats_remaining : s.seats;
                const booked = Math.max(0, cap - remaining);
                const isFull = remaining <= 0;
                const isLow = !isFull && remaining <= 4;
                const seatsClass = (isFull || isLow) ? 'seats-low' : 'seats-ok';
                const seatsTxt = isFull ? 'Udsolgt' : `${remaining} tilbage`;
                return `<div class="session-item" data-id="${s.id}">
                  <div class="session-date-badge">
                    <div class="sdb-d">${day}</div>
                    <div class="sdb-m">${mon}</div>
                  </div>
                  <div class="session-info">
                    <div class="session-venue">${escHtml(s.venue||s.location)}</div>
                    <div class="session-meta">${escHtml(s.location)} · ${escHtml(s.format)} · <b>${booked}/${cap}</b> booket</div>
                  </div>
                  <div class="session-badges">
                    ${s.is_popular ? '<span class="badge badge-active" style="gap:4px">★ Populært</span>' : ''}
                    <span class="seats-indicator ${seatsClass}" title="${booked} booket af ${cap} pladser">${seatsTxt}</span>
                    <button class="btn btn-sm btn-ghost btn-session-bookings" data-id="${s.id}" title="Se bookinger for dette hold">${booked} booket</button>
                    ${statusBadge(s.status)}
                  </div>
                  <div class="session-actions">
                    <button class="btn-icon btn-edit-session" data-id="${s.id}" title="Rediger">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon btn-delete-session" data-id="${s.id}" data-date="${s.date}" title="Slet">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </div>
                </div>`;
              }).join('')}
            </div>`
        }
      </div>`;

    document.getElementById('session-course-picker')?.addEventListener('change', e => {
      sessionPreselect = e.target.value;
      renderSessions();
    });

    document.getElementById('add-session-btn')?.addEventListener('click', () => openSessionForm(null, selId));

    document.querySelectorAll('.btn-edit-session').forEach(btn => {
      btn.addEventListener('click', () => openSessionForm(btn.dataset.id, selId));
    });

    document.querySelectorAll('.btn-session-bookings').forEach(btn => {
      btn.addEventListener('click', () => {
        bookingSessionFilter = btn.dataset.id;
        bookingFilter = 'alle';
        window.location.hash = 'bookings';
      });
    });

    document.querySelectorAll('.btn-delete-session').forEach(btn => {
      btn.addEventListener('click', async () => {
        const dateStr = fmtDate(btn.dataset.date);
        if (!await confirm('Slet hold', `Slet holdet den ${dateStr}?`)) return;
        try {
          await api('/sessions/' + btn.dataset.id, { method: 'DELETE' });
          toast('Hold slettet');
          sessionPreselect = selId;
          renderSessions();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  async function openSessionForm(id, courseId) {
    const isEdit = !!id;
    let sess = { course_id: courseId, is_online: 0, seats: 14, status: 'active' };
    if (isEdit) {
      try { sess = await api('/sessions/' + id); } catch (e) { toast(e.message, 'error'); return; }
    }

    const dateVal = sess.date ? sess.date.slice(0, 10) : '';

    openModal(isEdit ? 'Rediger hold' : 'Nyt hold', `
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Dato <span class="req">*</span></label>
          <input class="form-input" id="sess-date" type="date" value="${escHtml(dateVal)}" required>
        </div>
        <div class="form-group">
          <label class="form-label">By / Lokation <span class="req">*</span></label>
          <input class="form-input" id="sess-location" value="${escHtml(sess.location||'')}" placeholder="f.eks. København" required>
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Venue / Adresse</label>
          <input class="form-input" id="sess-venue" value="${escHtml(sess.venue||'')}" placeholder="f.eks. Tivoli Congress Center">
        </div>
        <div class="form-group">
          <label class="form-label">Format</label>
          <input class="form-input" id="sess-format" value="${escHtml(sess.format||'Fysisk · 1 dag')}" placeholder="Fysisk · 1 dag">
        </div>
        <div class="form-group">
          <label class="form-label">Kapacitet (pladser i alt)</label>
          <input class="form-input" id="sess-seats" type="number" min="0" max="999" value="${sess.seats||14}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="sess-status">
            ${['active','full','cancelled','archived'].map(s=>`<option value="${s}" ${s==sess.status?'selected':''}>${{active:'Aktiv',full:'Udsolgt',cancelled:'Aflyst',archived:'Arkiveret'}[s]}</option>`).join('')}
          </select>
        </div>
        <div class="form-group form-col-full" style="flex-direction:row;gap:24px">
          <label class="form-check">
            <input type="checkbox" id="sess-online" ${sess.is_online?'checked':''}>
            Online hold
          </label>
          <label class="form-check">
            <input type="checkbox" id="sess-popular" ${sess.is_popular?'checked':''}>
            Marker som populært
          </label>
        </div>
      </div>`,

      `<button class="btn btn-ghost" id="cancel-session">Annuller</button>
       <button class="btn btn-accent" id="save-session">${isEdit?'Gem ændringer':'Opret hold'}</button>`
    );

    document.getElementById('cancel-session').onclick = closeModal;
    document.getElementById('save-session').onclick = async () => {
      const date = document.getElementById('sess-date').value;
      const location = document.getElementById('sess-location').value.trim();
      if (!date || !location) { toast('Dato og lokation er påkrævet', 'error'); return; }
      const body = {
        course_id: courseId,
        date, location,
        venue: document.getElementById('sess-venue').value.trim(),
        format: document.getElementById('sess-format').value.trim(),
        seats: parseInt(document.getElementById('sess-seats').value) || 14,
        is_online: document.getElementById('sess-online').checked,
        is_popular: document.getElementById('sess-popular').checked,
        status: document.getElementById('sess-status').value,
      };
      try {
        const btn = document.getElementById('save-session');
        btn.textContent = 'Gemmer...'; btn.disabled = true;
        if (isEdit) {
          await api('/sessions/' + id, { method: 'PUT', body });
          toast('Hold opdateret');
        } else {
          await api('/sessions', { method: 'POST', body });
          toast('Hold oprettet');
        }
        closeModal();
        sessionPreselect = courseId;
        renderSessions();
      } catch (e) {
        toast(e.message, 'error');
        const btn = document.getElementById('save-session');
        if (btn) { btn.textContent = isEdit?'Gem ændringer':'Opret hold'; btn.disabled = false; }
      }
    };
  }

  /* ============================================================
     PAGE: BOOKINGS
  ============================================================ */
  let bookingFilter = 'alle';
  let bookingSessionFilter = null;

  async function renderBookings() {
    const query = bookingSessionFilter ? ('?session_id=' + bookingSessionFilter) : '';
    const bookings = await api('/bookings' + query);
    const filtered = bookingFilter === 'alle' ? bookings : bookings.filter(b => b.status === bookingFilter);

    // pending badge reflects ALL pending, not just the filtered view
    const allForBadge = bookingSessionFilter ? await api('/bookings') : bookings;
    const pending = allForBadge.filter(b => b.status === 'pending').length;
    document.getElementById('badge-bookings').textContent = pending > 0 ? pending : '';

    const ctxRow = bookings[0];
    const sessionBanner = bookingSessionFilter ? `
      <div class="session-filter-banner">
        <span>Viser bookinger for <b>${escHtml(ctxRow ? (ctxRow.course_title || 'hold') : 'hold')}</b>${ctxRow && ctxRow.date ? ' · ' + fmtDate(ctxRow.date) : ''}${ctxRow && ctxRow.location ? ' · ' + escHtml(ctxRow.location) : ''}</span>
        <button class="btn btn-sm btn-ghost" id="clear-session-filter">Ryd filter ✕</button>
      </div>` : '';

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Bookinger</h1>
          <div class="page-header-sub">${bookings.length} bookinger${bookingSessionFilter ? ' for dette hold' : ' i alt'} · ${pending} afventer bekræftelse</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-accent" id="add-booking-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ny booking
          </button>
        </div>
      </div>
      <div class="page-body">
        ${sessionBanner}
        <div class="toolbar">
          <div class="filter-chips">
            ${[['alle','Alle'],['pending','Afventer'],['confirmed','Bekræftet'],['cancelled','Annulleret']].map(([v,l])=>
              `<button class="chip ${bookingFilter===v?'active':''}" data-filter="${v}">${l}</button>`
            ).join('')}
          </div>
        </div>

        ${filtered.length === 0
          ? `<div class="empty-state">
              <div class="es-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
              <h3>Ingen bookinger</h3>
              <p>Bookinger vises her, når kunder tilmelder sig kurser.</p>
            </div>`
          : `<div class="table-wrap">
              <table id="bookings-table">
                <thead><tr>
                  <th>Kunde</th><th>Virksomhed</th><th>Kursus</th>
                  <th>Dato</th><th>Betaling</th><th>Deltagere</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  ${filtered.map(b => `
                    <tr>
                      <td>
                        <div class="td-title">${escHtml(b.customer_name)}</div>
                        <div class="td-sub">${escHtml(b.customer_email)}</div>
                      </td>
                      <td style="font-size:13px">${escHtml(b.customer_company||'—')}</td>
                      <td style="font-size:13px;color:var(--muted)">${escHtml(b.course_title||'—')}<br><span style="font-size:11.5px">${escHtml(b.location||'')}</span></td>
                      <td style="font-size:13px">${b.date ? fmtDate(b.date) : '—'}</td>
                      <td><span class="pill">${escHtml(b.payment_method||'—')}</span></td>
                      <td style="text-align:center;font-weight:700">${b.participants}</td>
                      <td>${statusBadge(b.status)}</td>
                      <td>
                        <div class="td-actions">
                          ${b.status === 'pending' ? `
                            <button class="btn btn-sm btn-accent btn-confirm-booking" data-id="${b.id}" title="Bekræft">Bekræft</button>
                          ` : ''}
                          <button class="btn-icon btn-edit-booking" data-id="${b.id}" title="Rediger">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          ${b.status !== 'cancelled' ? `
                            <button class="btn-icon btn-cancel-booking" data-id="${b.id}" title="Annuller">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>`;

    document.querySelectorAll('.chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        bookingFilter = chip.dataset.filter;
        renderBookings();
      });
    });

    document.getElementById('add-booking-btn')?.addEventListener('click', () => openBookingForm());
    document.getElementById('clear-session-filter')?.addEventListener('click', () => {
      bookingSessionFilter = null;
      renderBookings();
    });
    document.querySelectorAll('.btn-edit-booking').forEach(btn => {
      btn.addEventListener('click', () => openBookingEdit(btn.dataset.id, filtered.find(b => b.id == btn.dataset.id)));
    });

    document.querySelectorAll('.btn-confirm-booking').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/bookings/' + btn.dataset.id, { method: 'PUT', body: { status: 'confirmed' } });
          toast('Booking bekræftet');
          renderBookings();
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    document.querySelectorAll('.btn-cancel-booking').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirm('Annuller booking', 'Annuller denne booking?')) return;
        try {
          await api('/bookings/' + btn.dataset.id, { method: 'PUT', body: { status: 'cancelled' } });
          toast('Booking annulleret');
          renderBookings();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  /* ---- manual booking (phone/email orders) ---- */
  async function openBookingForm() {
    let courses, sessions;
    try { [courses, sessions] = await Promise.all([api('/courses'), api('/sessions')]); }
    catch (e) { toast(e.message, 'error'); return; }
    const active = courses.filter(c => c.status !== 'archived');
    if (!active.length) { toast('Opret et kursus først', 'error'); return; }

    const sessionOptions = (cid) => {
      const list = sessions.filter(s => s.course_id == cid && s.status === 'active');
      if (!list.length) return '<option value="">— ingen aktive hold —</option>';
      return list.map(s => {
        const rem = (s.seats_remaining != null) ? s.seats_remaining : s.seats;
        return `<option value="${s.id}" ${rem <= 0 ? 'disabled' : ''}>${fmtDate(s.date)} · ${escHtml(s.location)} (${rem <= 0 ? 'udsolgt' : rem + ' tilbage'})</option>`;
      }).join('');
    };

    openModal('Ny booking', `
      <div class="form-grid">
        <div class="form-group form-col-full">
          <label class="form-label">Kursus</label>
          <select class="form-select" id="bk-course">${active.map(c => `<option value="${c.id}">${escHtml(c.title)}</option>`).join('')}</select>
        </div>
        <div class="form-group form-col-full">
          <label class="form-label">Hold / dato</label>
          <select class="form-select" id="bk-session">${sessionOptions(active[0].id)}</select>
        </div>
        <div class="form-group"><label class="form-label">Navn <span class="req">*</span></label><input class="form-input" id="bk-name"></div>
        <div class="form-group"><label class="form-label">E-mail <span class="req">*</span></label><input class="form-input" id="bk-email" type="email"></div>
        <div class="form-group"><label class="form-label">Virksomhed</label><input class="form-input" id="bk-company"></div>
        <div class="form-group"><label class="form-label">Telefon</label><input class="form-input" id="bk-phone"></div>
        <div class="form-group"><label class="form-label">Antal deltagere</label><input class="form-input" id="bk-participants" type="number" min="1" max="999" value="1"></div>
        <div class="form-group"><label class="form-label">Betaling</label><select class="form-select" id="bk-payment">${['faktura','ean','kort','mobilepay'].map(p => `<option value="${p}">${p}</option>`).join('')}</select></div>
        <div class="form-group form-col-full"><label class="form-label">Status</label><select class="form-select" id="bk-status"><option value="confirmed">Bekræftet</option><option value="pending">Afventer</option></select></div>
        <div class="form-group form-col-full"><label class="form-label">Note (intern)</label><textarea class="form-textarea" id="bk-notes" placeholder="F.eks. telefonbestilling"></textarea></div>
      </div>`,
      `<button class="btn btn-ghost" id="cancel-bk">Annuller</button><button class="btn btn-accent" id="save-bk">Opret booking</button>`
    );

    const courseSel = document.getElementById('bk-course');
    courseSel.addEventListener('change', () => { document.getElementById('bk-session').innerHTML = sessionOptions(courseSel.value); });
    document.getElementById('cancel-bk').onclick = closeModal;
    document.getElementById('save-bk').onclick = async () => {
      const name = document.getElementById('bk-name').value.trim();
      const email = document.getElementById('bk-email').value.trim();
      if (!name || !email) { toast('Navn og e-mail er påkrævet', 'error'); return; }
      const sessionId = document.getElementById('bk-session').value;
      if (!sessionId) { toast('Vælg et aktivt hold med ledige pladser', 'error'); return; }
      const body = {
        session_id: sessionId,
        customer_name: name, customer_email: email,
        customer_company: document.getElementById('bk-company').value.trim(),
        customer_phone: document.getElementById('bk-phone').value.trim(),
        participants: parseInt(document.getElementById('bk-participants').value, 10) || 1,
        payment_method: document.getElementById('bk-payment').value,
        status: document.getElementById('bk-status').value,
        notes: document.getElementById('bk-notes').value.trim(),
      };
      const btn = document.getElementById('save-bk'); btn.disabled = true; btn.textContent = 'Gemmer...';
      try {
        await api('/bookings', { method: 'POST', body });
        toast('Booking oprettet'); closeModal(); renderBookings();
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Opret booking'; }
    };
  }

  /* ---- edit an existing booking (participants / status / payment / note) ---- */
  function openBookingEdit(id, b) {
    if (!b) return;
    openModal('Rediger booking', `
      <div class="form-grid">
        <div class="form-group form-col-full">
          <div class="td-title">${escHtml(b.customer_name)}</div>
          <div class="td-sub">${escHtml(b.course_title || '')}${b.date ? ' · ' + fmtDate(b.date) : ''}${b.location ? ' · ' + escHtml(b.location) : ''}</div>
          <div class="td-sub"><a href="mailto:${escHtml(b.customer_email)}">${escHtml(b.customer_email)}</a>${b.customer_phone ? ' · ' + escHtml(b.customer_phone) : ''}</div>
        </div>
        <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="be-status">${['pending','confirmed','cancelled'].map(s => `<option value="${s}" ${s==b.status?'selected':''}>${{pending:'Afventer',confirmed:'Bekræftet',cancelled:'Annulleret'}[s]}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Antal deltagere</label><input class="form-input" id="be-participants" type="number" min="1" max="999" value="${b.participants||1}"></div>
        <div class="form-group form-col-full"><label class="form-label">Betaling</label><select class="form-select" id="be-payment">${['faktura','ean','kort','mobilepay'].map(p => `<option value="${p}" ${p==b.payment_method?'selected':''}>${p}</option>`).join('')}</select></div>
        <div class="form-group form-col-full"><label class="form-label">Note (intern)</label><textarea class="form-textarea" id="be-notes">${escHtml(b.notes||'')}</textarea></div>
      </div>`,
      `<button class="btn btn-ghost" id="cancel-be">Luk</button><button class="btn btn-accent" id="save-be">Gem ændringer</button>`
    );
    document.getElementById('cancel-be').onclick = closeModal;
    document.getElementById('save-be').onclick = async () => {
      const body = {
        status: document.getElementById('be-status').value,
        participants: parseInt(document.getElementById('be-participants').value, 10) || 1,
        payment_method: document.getElementById('be-payment').value,
        notes: document.getElementById('be-notes').value.trim(),
      };
      const btn = document.getElementById('save-be'); btn.disabled = true; btn.textContent = 'Gemmer...';
      try {
        await api('/bookings/' + id, { method: 'PUT', body });
        toast('Booking opdateret'); closeModal(); renderBookings();
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Gem ændringer'; }
    };
  }

  /* ============================================================
     PAGE: INQUIRIES (Henvendelser)
  ============================================================ */
  let inquiryFilter = 'alle';

  const INQUIRY_TYPES = {
    contact:   { label: 'Kontakt',    cls: 'draft'     },
    firmahold: { label: 'Firmahold',  cls: 'confirmed' },
    notify:    { label: 'Nye datoer', cls: 'active'    },
    udbyder:   { label: 'Udbyder',    cls: 'archived'  },
  };

  function inquiryTypePill(type) {
    const t = INQUIRY_TYPES[type] || { label: type || '—', cls: 'draft' };
    return `<span class="badge badge-${t.cls}"><span class="badge-dot"></span>${t.label}</span>`;
  }

  function inquiryStatusBadge(status) {
    if (status === 'handled') return `<span class="badge badge-confirmed"><span class="badge-dot"></span>Behandlet</span>`;
    return `<span class="badge badge-pending"><span class="badge-dot"></span>Ny</span>`;
  }

  async function renderInquiries() {
    const inquiries = await api('/inquiries');
    const filtered = inquiryFilter === 'alle'
      ? inquiries
      : inquiries.filter(i => i.status === inquiryFilter);

    const newCount = inquiries.filter(i => i.status === 'new').length;
    const badge = document.getElementById('badge-inquiries');
    if (badge) badge.textContent = newCount > 0 ? newCount : '';

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Henvendelser</h1>
          <div class="page-header-sub">${inquiries.length} henvendelser i alt · ${newCount} nye</div>
        </div>
      </div>
      <div class="page-body">
        <div class="toolbar">
          <div class="filter-chips">
            ${[['alle','Alle'],['new','Nye'],['handled','Behandlet']].map(([v,l])=>
              `<button class="chip ${inquiryFilter===v?'active':''}" data-filter="${v}">${l}</button>`
            ).join('')}
          </div>
        </div>

        ${filtered.length === 0
          ? `<div class="empty-state">
              <div class="es-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
              <h3>Ingen henvendelser</h3>
              <p>Beskeder fra kontakt-, firmahold- og notify-formularerne vises her.</p>
            </div>`
          : `<div class="table-wrap">
              <table id="inquiries-table">
                <thead><tr>
                  <th>Type</th><th>Afsender</th><th>Virksomhed</th>
                  <th>Emne / besked</th><th>Modtaget</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  ${filtered.map(i => {
                    const subjectBits = [];
                    if (i.subject) subjectBits.push(escHtml(i.subject));
                    if (i.course_title) subjectBits.push('Kursus: ' + escHtml(i.course_title));
                    if (i.participants) subjectBits.push(i.participants + ' deltagere');
                    const head = subjectBits.length ? `<div class="td-title">${subjectBits.join(' · ')}</div>` : '';
                    const msg = i.message ? `<div class="td-sub">${escHtml(i.message)}</div>` : '';
                    return `
                    <tr>
                      <td>${inquiryTypePill(i.type)}</td>
                      <td>
                        <div class="td-title">${escHtml(i.name || '—')}</div>
                        <div class="td-sub"><a href="mailto:${escHtml(i.email)}" style="color:var(--accent)">${escHtml(i.email)}</a>${i.phone ? ' · ' + escHtml(i.phone) : ''}</div>
                      </td>
                      <td style="font-size:13px">${escHtml(i.company || '—')}</td>
                      <td style="font-size:13px;color:var(--muted);max-width:340px">${head || msg ? head + msg : '—'}</td>
                      <td style="font-size:13px">${fmtDate(i.created_at)}</td>
                      <td>${inquiryStatusBadge(i.status)}</td>
                      <td>
                        <div class="td-actions">
                          ${i.status !== 'handled' ? `
                            <button class="btn btn-sm btn-accent btn-handle-inquiry" data-id="${i.id}" title="Markér behandlet">Behandlet</button>
                          ` : ''}
                          <button class="btn-icon btn-delete-inquiry" data-id="${i.id}" title="Slet">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>`;

    document.querySelectorAll('.chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        inquiryFilter = chip.dataset.filter;
        renderInquiries();
      });
    });

    document.querySelectorAll('.btn-handle-inquiry').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/inquiries/' + btn.dataset.id, { method: 'PUT', body: { status: 'handled' } });
          toast('Markeret som behandlet');
          renderInquiries();
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    document.querySelectorAll('.btn-delete-inquiry').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await confirm('Slet henvendelse', 'Slet denne henvendelse permanent?')) return;
        try {
          await api('/inquiries/' + btn.dataset.id, { method: 'DELETE' });
          toast('Henvendelse slettet');
          renderInquiries();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  /* ============================================================
     PAGES REGISTRY
  ============================================================ */
  const PAGES = {
    dashboard: renderDashboard,
    courses:   renderCourses,
    suppliers: renderSuppliers,
    categories:renderCategories,
    sessions:  renderSessions,
    bookings:  renderBookings,
    inquiries: renderInquiries,
  };

  /* ============================================================
     ROUTER
  ============================================================ */
  function route() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    navigate(hash);
  }

  window.addEventListener('hashchange', route);

  // Nav item clicks
  document.querySelectorAll('.nav-item[data-page]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const page = a.dataset.page;
      if (page === 'bookings') bookingSessionFilter = null; // nav = show all
      window.location.hash = page;
    });
  });

  // Footer link
  document.querySelectorAll('[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = a.getAttribute('href').slice(1);
      if (PAGES[target]) {
        e.preventDefault();
        window.location.hash = target;
      }
    });
  });

  /* ============ LOGIN GATE ============ */
  function showLogin(message) {
    const inputStyle = 'padding:13px 15px;border:1.5px solid var(--border,#ddd);border-radius:10px;font-size:15px;width:100%';
    content.innerHTML = `
      <div style="max-width:420px;margin:14vh auto 0;text-align:center">
        <div style="font-family:'Instrument Serif',serif;font-size:2rem;margin-bottom:6px">Futurematch Admin</div>
        <p style="color:var(--muted);margin-bottom:22px">Log ind for at fortsætte.</p>
        ${message ? `<div style="background:#fde8e4;color:#a32;padding:10px 14px;border-radius:10px;margin-bottom:16px;font-size:14px">${escHtml(message)}</div>` : ''}
        <form id="login-form" style="display:flex;flex-direction:column;gap:12px">
          <input id="login-username" type="text" placeholder="Brugernavn" autocomplete="username" style="${inputStyle}">
          <input id="login-password" type="password" placeholder="Adgangskode" autocomplete="current-password" style="${inputStyle}">
          <button class="btn btn-accent" type="submit" style="justify-content:center;padding:13px">Log ind</button>
        </form>
      </div>`;
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      if (!username || !password) return;
      const btn = form.querySelector('button');
      btn.disabled = true; btn.textContent = 'Logger ind…';
      try {
        const res = await fetch(API + '/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Login mislykkedes');
        setToken(data.token);
        boot();
      } catch (err) {
        showLogin(err.message || 'Login mislykkedes');
      }
    });
    document.getElementById('login-username').focus();
  }

  async function boot() {
    if (!adminToken) { showLogin(); return; }
    try {
      await api('/stats');          // validate stored token before showing the app
    } catch (_) { return; }          // 401 handler shows login
    route();
  }

  boot();
})();
