/* ============================================================
   FUTUREMATCH — minside.js
   Customer dashboard: upcoming courses (when & where to go),
   order history with live status, and post-course reviews.
   ============================================================ */
(function () {
  'use strict';

  var Account = window.FuturematchAccount;
  var root = document.getElementById('minside-root');
  var nav = document.getElementById('nav');
  if (!Account || !root) return;

  window.addEventListener('scroll', function () {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var M_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

  function parseDate(s) {
    if (!s) return null;
    var d = new Date(s + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(s) {
    var d = parseDate(s);
    return d ? d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }

  function fmtMoney(n) {
    n = Number(n) || 0;
    return n ? 'kr. ' + n.toLocaleString('da-DK') : 'Gratis';
  }

  function daysUntil(s) {
    var d = parseDate(s);
    if (!d) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  function countdownChip(dateStr) {
    var days = daysUntil(dateStr);
    if (days == null) return '';
    if (days === 0) return '<span class="ms-chip today">I dag</span>';
    if (days === 1) return '<span class="ms-chip soon">I morgen</span>';
    if (days <= 14) return '<span class="ms-chip soon">Om ' + days + ' dage</span>';
    return '<span class="ms-chip">Om ' + days + ' dage</span>';
  }

  var STATUS_LABELS = {
    pending: { label: 'Afventer bekræftelse', cls: 'pending' },
    confirmed: { label: 'Bekræftet', cls: 'confirmed' },
    cancelled: { label: 'Aflyst', cls: 'cancelled' },
  };

  function statusChip(status) {
    var s = STATUS_LABELS[status] || STATUS_LABELS.pending;
    return '<span class="ms-status ' + s.cls + '">' + s.label + '</span>';
  }

  /* ---- calendar (.ics) download ---- */
  function icsDate(s, plusDays) {
    var d = parseDate(s);
    if (!d) return '';
    if (plusDays) d.setDate(d.getDate() + plusDays);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }

  function downloadIcs(item, reference) {
    var start = icsDate(item.date);
    if (!start) return;
    // all-day event; DTEND is exclusive, so + 1 day past the last course day
    var end = icsDate(item.end_date || item.date, 1);
    var location = item.is_online ? 'Online' : [item.venue, item.location].filter(Boolean).join(', ');
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Futurematch//DA',
      'BEGIN:VEVENT',
      'UID:' + reference + '-' + item.session_id + '@futurematch',
      'DTSTART;VALUE=DATE:' + start,
      'DTEND;VALUE=DATE:' + end,
      'SUMMARY:' + item.course_title.replace(/[,;\\]/g, ' '),
      'LOCATION:' + location.replace(/[,;\\]/g, ' '),
      'DESCRIPTION:Ordre ' + reference + ' · ' + (item.supplier_name || 'Futurematch').replace(/[,;\\]/g, ' '),
      'END:VEVENT', 'END:VCALENDAR',
    ];
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = item.course_title.replace(/[^\wæøåÆØÅ -]/g, '').slice(0, 60) + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function mapsUrl(item) {
    return 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent([item.venue, item.location].filter(Boolean).join(', '));
  }

  /* ---- collect items across orders ---- */
  function allItems(account) {
    var out = [];
    account.orders.forEach(function (order) {
      order.items.forEach(function (item) {
        out.push({ order: order, item: item });
      });
    });
    return out;
  }

  function upcoming(account) {
    return allItems(account)
      .filter(function (e) { return e.order.status !== 'cancelled' && e.item.date && daysUntil(e.item.date) >= 0; })
      .sort(function (a, b) { return a.item.date < b.item.date ? -1 : 1; });
  }

  function past(account) {
    var seen = {};
    return allItems(account)
      .filter(function (e) { return e.order.status !== 'cancelled' && e.item.date && daysUntil(e.item.date) < 0; })
      .filter(function (e) {
        // one review card per course
        if (!e.item.course_id || seen[e.item.course_id]) return false;
        seen[e.item.course_id] = true;
        return true;
      })
      .sort(function (a, b) { return a.item.date > b.item.date ? -1 : 1; });
  }

  /* ============ RENDER ============ */

  function upcomingCardHTML(entry) {
    var item = entry.item;
    var order = entry.order;
    var d = parseDate(item.date);
    var practical = item.is_online
      ? 'Online — du modtager et link inden start'
      : [item.venue, item.location].filter(Boolean).join(' · ');
    return '<article class="ms-card">' +
      '<div class="ms-date-block">' +
        '<span class="d">' + (d ? String(d.getDate()).padStart(2, '0') : '–') + '</span>' +
        '<span class="m">' + (d ? M_ABBR[d.getMonth()] : '') + '</span>' +
        '<span class="y">' + (d ? d.getFullYear() : '') + '</span>' +
      '</div>' +
      '<div class="ms-card-main">' +
        '<div class="ms-card-chips">' + countdownChip(item.date) + statusChip(order.status) + '</div>' +
        '<h3 class="ms-card-title"><a href="kursus.html?id=' + (+item.course_id) + '">' + esc(item.course_title) + '</a></h3>' +
        '<div class="ms-card-meta">' +
          '<span>' + esc(practical) + '</span>' +
          (item.format ? '<span>' + esc(item.format) + '</span>' : '') +
          '<span>' + item.participants + ' deltager' + (item.participants === 1 ? '' : 'e') + '</span>' +
          '<span>Ordre ' + esc(order.reference) + '</span>' +
        '</div>' +
        (order.status === 'pending' ? '<p class="ms-pending-note">Vi bekræfter din plads inden for 24 timer — du hører fra os på mail.</p>' : '') +
        '<div class="ms-card-actions">' +
          '<button class="ms-action" data-ics data-ref="' + esc(order.reference) + '" data-sid="' + (+item.session_id) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Føj til kalender</button>' +
          (!item.is_online && (item.venue || item.location)
            ? '<a class="ms-action" target="_blank" rel="noopener" href="' + esc(mapsUrl(item)) + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>Find vej</a>'
            : '') +
          '<a class="ms-action" href="kursus.html?id=' + (+item.course_id) + '">Se kursus →</a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function starsHTML(courseId, name) {
    var inputs = [5, 4, 3, 2, 1].map(function (v) {
      return '<input type="radio" id="star-' + courseId + '-' + v + '" name="rating-' + courseId + '" value="' + v + '">' +
        '<label for="star-' + courseId + '-' + v + '" title="' + v + ' stjerner">★</label>';
    }).join('');
    return '<div class="ms-stars" role="radiogroup" aria-label="Din bedømmelse af ' + esc(name) + '">' + inputs + '</div>';
  }

  function pastCardHTML(entry) {
    var item = entry.item;
    var reviewed = Account.reviewedRating(item.course_id);
    var body;
    if (reviewed) {
      body = '<div class="ms-reviewed">Du gav ' +
        '<span class="ms-star-static">' + '★'.repeat(reviewed) + '</span> — tak for din anmeldelse!</div>';
    } else {
      body =
        '<form class="ms-review-form" data-review data-course="' + (+item.course_id) + '" data-ref="' + esc(entry.order.reference) + '">' +
          starsHTML(item.course_id, item.course_title) +
          '<textarea class="fc-input ms-review-text" rows="2" placeholder="Hvad fik du ud af kurset? (valgfrit)"></textarea>' +
          '<div class="ms-review-foot">' +
            '<span class="ms-review-error" hidden></span>' +
            '<button class="ms-action solid" type="submit">Send anmeldelse</button>' +
          '</div>' +
        '</form>';
    }
    return '<article class="ms-card past">' +
      '<div class="ms-card-main">' +
        '<div class="ms-card-chips"><span class="ms-chip">Afholdt ' + esc(fmtDate(item.date)) + '</span></div>' +
        '<h3 class="ms-card-title"><a href="kursus.html?id=' + (+item.course_id) + '">' + esc(item.course_title) + '</a></h3>' +
        '<div class="ms-card-meta"><span>' + esc(item.supplier_name || '') + '</span></div>' +
        body +
      '</div>' +
    '</article>';
  }

  function orderRowHTML(order) {
    var titles = order.items.map(function (i) { return i.course_title; }).filter(Boolean);
    var summary = titles.slice(0, 2).join(', ') + (titles.length > 2 ? ' +' + (titles.length - 2) : '');
    return '<div class="ms-order-row">' +
      '<div class="ms-order-ref"><b>' + esc(order.reference) + '</b><span>' + esc(fmtDate(order.created_at.slice(0, 10)) || '') + '</span></div>' +
      '<div class="ms-order-items">' + esc(summary) + '</div>' +
      '<div class="ms-order-status">' + statusChip(order.status) + '</div>' +
      '<div class="ms-order-total">' + fmtMoney(order.total_inc_vat) + '<small> inkl. moms</small></div>' +
    '</div>';
  }

  function lookupFormHTML(compact) {
    return '<form class="ms-lookup-form" data-lookup>' +
      '<div class="fc-row">' +
        '<div class="fc-field"><label>E-mail <span class="req">*</span></label><input class="fc-input" type="email" name="email" placeholder="din@mail.dk" required autocomplete="email"></div>' +
        '<div class="fc-field"><label>Ordrenummer <span class="req">*</span></label><input class="fc-input" type="text" name="reference" placeholder="FM-XXXXXX-XXXXXX" required></div>' +
      '</div>' +
      '<div class="ms-review-foot">' +
        '<span class="ms-review-error" hidden></span>' +
        '<button class="fc-submit" type="submit" style="width:auto;padding:12px 26px;margin-top:0">' + (compact ? 'Tilføj ordre' : 'Find mine kurser') + ' <span class="arrow">→</span></button>' +
      '</div>' +
      '<p class="fc-micro">Du finder ordrenummeret i din ordrebekræftelse (starter med FM-).</p>' +
    '</form>';
  }

  function emptyStateHTML() {
    return '<div class="ms-empty">' +
      '<div class="form-card" style="max-width:560px;margin:0 auto">' +
        '<h3>Se dine kurser og ordrer</h3>' +
        '<p class="fc-sub">Indtast din e-mail og dit ordrenummer, så samler vi dine tilmeldinger her — med datoer, mødesteder og mulighed for at anmelde bagefter.</p>' +
        lookupFormHTML(false) +
      '</div>' +
      '<div class="ms-empty-alt">' +
        '<p>Har du ikke bestilt endnu?</p>' +
        '<a class="btn-book" href="Kategorier.html" style="display:inline-flex">Udforsk kurser <span class="arrow">→</span></a>' +
      '</div>' +
    '</div>';
  }

  function dashboardHTML(account) {
    var up = upcoming(account);
    var done = past(account);
    var html = '';

    html += '<section class="ms-section">' +
      '<div class="ms-section-head">' +
        '<h2 class="display">Kommende kurser</h2>' +
        '<button class="ms-refresh" data-refresh>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>' +
          'Opdatér status</button>' +
      '</div>' +
      (up.length
        ? '<div class="ms-cards">' + up.map(upcomingCardHTML).join('') + '</div>'
        : '<div class="ms-none">Ingen kommende kurser. <a href="Kategorier.html">Find dit næste kursus →</a></div>') +
    '</section>';

    if (done.length) {
      html += '<section class="ms-section">' +
        '<div class="ms-section-head"><h2 class="display">Afholdte kurser</h2>' +
        '<span class="ms-section-sub">Del din oplevelse — det hjælper andre kursister.</span></div>' +
        '<div class="ms-cards">' + done.map(pastCardHTML).join('') + '</div>' +
      '</section>';
    }

    html += '<section class="ms-section">' +
      '<div class="ms-section-head"><h2 class="display">Dine ordrer</h2></div>' +
      '<div class="ms-orders">' + account.orders.map(orderRowHTML).join('') + '</div>' +
    '</section>';

    html += '<section class="ms-section ms-footer-tools">' +
      '<details class="ms-add-order"><summary>Tilføj en anden ordre</summary>' + lookupFormHTML(true) + '</details>' +
      '<button class="ms-logout" data-logout>Log ud og glem mig på denne enhed</button>' +
    '</section>';

    return html;
  }

  /* ============ BINDINGS ============ */

  function bindAll(account) {
    root.querySelectorAll('[data-ics]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ref = btn.getAttribute('data-ref');
        var sid = Number(btn.getAttribute('data-sid'));
        var entry = allItems(account).find(function (e) {
          return e.order.reference === ref && e.item.session_id === sid;
        });
        if (entry) downloadIcs(entry.item, ref);
      });
    });

    root.querySelectorAll('[data-review]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var courseId = Number(form.getAttribute('data-course'));
        var err = form.querySelector('.ms-review-error');
        var rating = form.querySelector('input[name="rating-' + courseId + '"]:checked');
        if (!rating) { err.textContent = 'Vælg antal stjerner først.'; err.hidden = false; return; }
        err.hidden = true;
        var btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Sender…';
        fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            course_id: courseId,
            rating: Number(rating.value),
            comment: form.querySelector('.ms-review-text').value.trim(),
            name: account.name,
            email: account.email,
            order_reference: form.getAttribute('data-ref') || '',
          }),
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (res) {
            if (!res.ok) throw new Error(res.data.error || 'Anmeldelsen kunne ikke sendes');
            Account.markReviewed(courseId, Number(rating.value));
            render();
          })
          .catch(function (e2) {
            btn.disabled = false;
            btn.textContent = 'Send anmeldelse';
            err.textContent = e2.message;
            err.hidden = false;
          });
      });
    });

    root.querySelectorAll('[data-lookup]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = form.querySelector('.ms-review-error');
        var email = form.querySelector('[name="email"]').value.trim();
        var reference = form.querySelector('[name="reference"]').value.trim();
        var btn = form.querySelector('button[type="submit"]');
        err.hidden = true;
        btn.disabled = true;
        fetch('/api/orders/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: reference, email: email }),
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (res) {
            if (!res.ok) throw new Error(res.data.error || 'Ordren blev ikke fundet');
            Account.addLookedUpOrder(res.data);
            render();
          })
          .catch(function (e2) {
            btn.disabled = false;
            err.textContent = e2.message;
            err.hidden = false;
          });
      });
    });

    var refresh = root.querySelector('[data-refresh]');
    if (refresh) refresh.addEventListener('click', function () {
      refresh.disabled = true;
      refresh.classList.add('spinning');
      Account.refreshOrders().then(function () { render(); });
    });

    var logout = root.querySelector('[data-logout]');
    if (logout) logout.addEventListener('click', function () {
      if (window.confirm('Fjern dine ordrer og oplysninger fra denne enhed?')) {
        Account.logout();
        render();
      }
    });
  }

  function setHeader(account) {
    var hello = document.getElementById('ms-hello');
    var sub = document.getElementById('ms-sub');
    if (!hello) return;
    if (account.email) {
      var first = (account.name || '').split(' ')[0];
      hello.innerHTML = first ? 'Hej <span class="ital">' + esc(first) + '</span>' : 'Dine <span class="ital">kurser</span>';
      if (sub) sub.textContent = account.email + ' · ' + account.orders.length + ' ordre' + (account.orders.length === 1 ? '' : 'r');
    } else {
      hello.innerHTML = 'Dine <span class="ital">kurser</span>';
      if (sub) sub.textContent = 'Følg dine tilmeldinger, se hvornår og hvor du skal møde op — og anmeld kurserne bagefter.';
    }
  }

  function render() {
    var account = Account.get();
    setHeader(account);
    root.innerHTML = (account.email && account.orders.length) ? dashboardHTML(account) : emptyStateHTML();
    bindAll(account);
  }

  render();

  // pull fresh order statuses once per visit
  if (Account.isKnown()) {
    Account.refreshOrders().then(function () { render(); });
  }
})();
