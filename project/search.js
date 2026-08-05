/* ============================================================
   FUTUREMATCH — search.js
   Header search: injects a search field into the nav on every
   page and shows live results from /api/courses as you type.
   ============================================================ */
(function () {
  'use strict';

  var actions = document.querySelector('.nav .nav-actions');
  if (!actions) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function priceLabel(c) {
    if (c.badge === 'amu' || !Number(c.price || 0)) return 'Gratis*';
    return 'kr. ' + (+c.price).toLocaleString('da-DK');
  }

  /* ---- markup ---- */
  var wrap = document.createElement('div');
  wrap.className = 'nav-search';
  wrap.innerHTML =
    '<button class="ns-toggle" type="button" aria-label="Søg efter kurser">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
    '</button>' +
    '<div class="ns-box" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-owns="ns-results">' +
      '<svg class="ns-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input type="search" class="ns-input" placeholder="Søg kurser…" aria-label="Søg efter kurser" aria-autocomplete="list" aria-controls="ns-results" autocomplete="off">' +
      '<div class="ns-results" id="ns-results" role="listbox" hidden></div>' +
    '</div>';
  actions.insertBefore(wrap, actions.firstChild);

  var box     = wrap.querySelector('.ns-box');
  var input   = wrap.querySelector('.ns-input');
  var results = wrap.querySelector('.ns-results');
  var toggle  = wrap.querySelector('.ns-toggle');

  /* ---- state ---- */
  var cache = {};        // term → courses
  var controller = null; // in-flight fetch
  var debounceTimer = null;
  var activeIndex = -1;

  function setOpen(on) {
    results.hidden = !on;
    box.setAttribute('aria-expanded', String(on));
    if (!on) activeIndex = -1;
  }

  function rows() {
    return Array.prototype.slice.call(results.querySelectorAll('.ns-item, .ns-all'));
  }

  function setActive(idx) {
    var list = rows();
    if (!list.length) return;
    activeIndex = (idx + list.length) % list.length;
    list.forEach(function (el, i) {
      el.classList.toggle('active', i === activeIndex);
      el.setAttribute('aria-selected', String(i === activeIndex));
    });
    list[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function render(term, courses) {
    if (!courses.length) {
      results.innerHTML = '<div class="ns-empty">Ingen kurser matcher “' + esc(term) + '”</div>';
      setOpen(true);
      return;
    }
    var items = courses.slice(0, 7).map(function (c) {
      var thumb = c.image_src
        ? '<img src="' + esc(c.image_src) + '" alt="" loading="lazy" onerror="this.parentNode.textContent=this.alt">'
        : esc((c.title || '?').slice(0, 1).toUpperCase());
      var sub = [c.supplier_name, c.duration].filter(Boolean).join(' · ');
      return '<a class="ns-item" role="option" aria-selected="false" href="kursus.html?id=' + (+c.id) + '">' +
        '<span class="ns-thumb">' + thumb + '</span>' +
        '<span class="ns-main">' +
          '<span class="ns-title">' + esc(c.title) + '</span>' +
          (sub ? '<span class="ns-sub">' + esc(sub) + '</span>' : '') +
        '</span>' +
        '<span class="ns-price">' + priceLabel(c) + '</span>' +
      '</a>';
    }).join('');
    var all = courses.length > 7
      ? '<a class="ns-all" role="option" aria-selected="false" href="Kategorier.html#q=' + encodeURIComponent(term) + '">Se alle ' + courses.length + ' resultater <span class="arrow">→</span></a>'
      : '';
    results.innerHTML = items + all;
    setOpen(true);
  }

  function search(term) {
    if (cache[term]) { render(term, cache[term]); return; }
    if (controller) controller.abort();
    controller = 'AbortController' in window ? new AbortController() : null;
    fetch('/api/courses?status=active&q=' + encodeURIComponent(term), controller ? { signal: controller.signal } : undefined)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (courses) {
        courses = Array.isArray(courses) ? courses : [];
        cache[term] = courses;
        // only render if the field still shows this term
        if (input.value.trim() === term) render(term, courses);
      })
      .catch(function () { /* aborted or offline — keep whatever is shown */ });
  }

  function onInput() {
    var term = input.value.trim();
    clearTimeout(debounceTimer);
    if (term.length < 2) { setOpen(false); return; }
    debounceTimer = setTimeout(function () { search(term); }, 220);
  }

  // Kategorier's hash router picks this up via hashchange when we're already
  // on that page; everywhere else it's a normal navigation.
  function go(term) {
    window.location.href = 'Kategorier.html#q=' + encodeURIComponent(term);
    setOpen(false);
  }

  input.addEventListener('input', onInput);
  input.addEventListener('focus', function () {
    if (input.value.trim().length >= 2 && results.innerHTML) setOpen(true);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === 'Enter') {
      var list = rows();
      var term = input.value.trim();
      if (activeIndex >= 0 && list[activeIndex]) window.location.href = list[activeIndex].getAttribute('href');
      else if (term) go(term);
    }
    else if (e.key === 'Escape') { setOpen(false); input.blur(); wrap.classList.remove('open'); }
  });

  toggle.addEventListener('click', function () {
    var on = wrap.classList.toggle('open');
    if (on) input.focus();
    else setOpen(false);
  });

  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) { setOpen(false); wrap.classList.remove('open'); }
  });
})();
