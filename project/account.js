/* ============================================================
   FUTUREMATCH — account.js
   Lightweight customer identity + order archive in localStorage.
   Orders land here automatically at checkout and can be added via
   the server-verified lookup (reference + e-mail). Also injects
   the "Min side" link into the nav on every page.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'fm_account_v1';

  function read() {
    try {
      var parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
      return {
        name: typeof parsed.name === 'string' ? parsed.name : '',
        email: typeof parsed.email === 'string' ? parsed.email : '',
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        reviewed: parsed.reviewed && typeof parsed.reviewed === 'object' ? parsed.reviewed : {},
      };
    } catch (_) {
      return { name: '', email: '', orders: [], reviewed: {} };
    }
  }

  function write(account) {
    try {
      localStorage.setItem(KEY, JSON.stringify(account));
    } catch (_) { /* ignore storage failures */ }
    updateNav(account);
    window.dispatchEvent(new CustomEvent('fm-account-change', { detail: { account: account } }));
    return account;
  }

  function clean(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max || 240);
  }

  function normalizeItem(item) {
    return {
      session_id: Number(item.session_id) || 0,
      course_id: Number(item.course_id) || 0,
      course_title: clean(item.course_title, 180),
      supplier_name: clean(item.supplier_name, 180),
      date: clean(item.date, 20),
      end_date: clean(item.end_date, 20),
      location: clean(item.location, 120),
      venue: clean(item.venue, 160),
      format: clean(item.format, 120),
      is_online: !!item.is_online,
      participants: Math.max(1, Number(item.participants) || 1),
      unit_price: Math.max(0, Number(item.unit_price) || 0),
      image_src: clean(item.image_src, 500),
    };
  }

  function normalizeOrder(order) {
    return {
      reference: clean(order.reference, 60),
      status: clean(order.status, 30) || 'pending',
      created_at: clean(order.created_at, 40) || new Date().toISOString(),
      payment_method: clean(order.payment_method, 30),
      total_ex_vat: Number(order.total_ex_vat) || 0,
      vat_total: Number(order.vat_total) || 0,
      total_inc_vat: Number(order.total_inc_vat) || 0,
      discount_total: Number(order.discount_total) || 0,
      items: (Array.isArray(order.items) ? order.items : []).map(normalizeItem),
    };
  }

  function upsertOrder(account, order) {
    var next = normalizeOrder(order);
    if (!next.reference) return account;
    var idx = account.orders.findIndex(function (o) { return o.reference === next.reference; });
    if (idx >= 0) account.orders[idx] = next;
    else account.orders.unshift(next);
    return account;
  }

  /* ---- public API ---- */
  function get() { return read(); }

  function isKnown() {
    var a = read();
    return !!(a.email && a.orders.length);
  }

  // Called from checkout success: order = server response, customer = form
  // data, items = the cart lines (they carry the session/course details).
  function recordOrder(order, customer, items) {
    var account = read();
    account.name = clean(customer.name, 160) || account.name;
    account.email = clean(customer.email, 180).toLowerCase() || account.email;
    upsertOrder(account, {
      reference: order.reference,
      status: order.status || 'pending',
      payment_method: order.payment_method,
      total_ex_vat: order.total_ex_vat,
      vat_total: order.vat_total,
      total_inc_vat: order.total_inc_vat,
      discount_total: order.discount_total,
      items: items,
    });
    return write(account);
  }

  // Called with a /api/orders/lookup response — server-verified.
  function addLookedUpOrder(data) {
    var account = read();
    account.name = account.name || clean(data.customer_name, 160);
    account.email = clean(data.customer_email, 180).toLowerCase() || account.email;
    upsertOrder(account, data);
    return write(account);
  }

  // Re-fetch every stored order so statuses stay current. Resolves with the
  // refreshed account; failed lookups keep the stored copy.
  function refreshOrders() {
    var account = read();
    if (!account.email || !account.orders.length) return Promise.resolve(account);
    var lookups = account.orders.map(function (order) {
      return fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: order.reference, email: account.email }),
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    });
    return Promise.all(lookups).then(function (results) {
      var fresh = read();
      results.forEach(function (data) { if (data) upsertOrder(fresh, data); });
      return write(fresh);
    });
  }

  function markReviewed(courseId, rating) {
    var account = read();
    account.reviewed[String(courseId)] = Number(rating) || 0;
    return write(account);
  }

  function reviewedRating(courseId) {
    return read().reviewed[String(courseId)] || 0;
  }

  function logout() {
    try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
    updateNav(read());
    window.dispatchEvent(new CustomEvent('fm-account-change', { detail: { account: read() } }));
  }

  /* ---- nav injection ---- */
  function upcomingCount(account) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var n = 0;
    account.orders.forEach(function (order) {
      if (order.status === 'cancelled') return;
      order.items.forEach(function (item) {
        if (item.date && new Date(item.date + 'T00:00:00') >= today) n++;
      });
    });
    return n;
  }

  function updateNav(account) {
    var link = document.querySelector('[data-account-link]');
    if (!link) return;
    var count = upcomingCount(account || read());
    var badge = link.querySelector('[data-account-count]');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    link.classList.toggle('has-items', count > 0);
  }

  function injectNavLink() {
    var actions = document.querySelector('.nav .nav-actions');
    if (!actions || actions.querySelector('[data-account-link]')) return;
    var link = document.createElement('a');
    link.className = 'nav-account';
    link.href = 'MinSide.html';
    link.setAttribute('data-account-link', '');
    link.setAttribute('aria-label', 'Min side');
    link.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
      '<span class="nav-account-label">Min side</span>' +
      '<span class="cart-count" data-account-count hidden>0</span>';
    var cart = actions.querySelector('[data-cart-link]');
    actions.insertBefore(link, cart || actions.firstChild);
    updateNav(read());
  }

  window.FuturematchAccount = {
    get: get,
    isKnown: isKnown,
    recordOrder: recordOrder,
    addLookedUpOrder: addLookedUpOrder,
    refreshOrders: refreshOrders,
    markReviewed: markReviewed,
    reviewedRating: reviewedRating,
    logout: logout,
  };

  injectNavLink();
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) updateNav(read());
  });
})();
