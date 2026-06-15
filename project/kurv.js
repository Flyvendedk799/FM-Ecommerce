(function () {
  'use strict';

  var Cart = window.FuturematchCart;
  var root = document.getElementById('cart-root');
  var nav = document.getElementById('nav');

  window.addEventListener('scroll', function () {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function dateBadge(item) {
    var d = new Date(item.date + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return '<div class="cart-date"><b>--</b><span>Dato</span></div>';
    var months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    return '<div class="cart-date"><b>' + d.getDate() + '</b><span>' + months[d.getMonth()] + '</span></div>';
  }

  function itemHTML(item) {
    var discount = Cart.lineDiscount(item);
    var meta = [
      Cart.formatDate(item.date),
      item.location,
      item.format,
      item.supplier_name,
    ].filter(Boolean).join(' · ');
    return '<article class="cart-item" data-session-id="' + item.session_id + '">' +
      dateBadge(item) +
      '<div>' +
        '<a class="cart-title" href="' + esc(item.url || ('kursus.html?id=' + item.course_id)) + '">' + esc(item.course_title) + '</a>' +
        '<div class="cart-meta">' + esc(meta) + '</div>' +
        '<div class="cart-actions">' +
          '<div class="qty-control" aria-label="Antal deltagere">' +
            '<button type="button" data-qty="-1" aria-label="Færre deltagere">−</button>' +
            '<input type="number" min="1" max="999" value="' + item.participants + '" data-qty-input aria-label="Antal deltagere">' +
            '<button type="button" data-qty="1" aria-label="Flere deltagere">+</button>' +
          '</div>' +
          '<button type="button" class="cart-remove" data-remove>Fjern</button>' +
        '</div>' +
      '</div>' +
      '<div class="cart-price">' +
        '<strong>' + Cart.formatMoney(Cart.lineTotal(item)) + '</strong>' +
        '<small>' + item.participants + ' × ' + Cart.formatMoney(item.unit_price) + ' ekskl. moms</small>' +
        (discount ? '<div class="cart-discount">−' + Cart.formatMoney(discount) + ' mængderabat</div>' : '') +
      '</div>' +
    '</article>';
  }

  function summaryHTML(items) {
    var t = Cart.totals(items);
    return '<aside class="summary-card">' +
      '<h2>Ordreoverblik</h2>' +
      '<div class="summary-lines">' +
        '<div class="summary-line"><span>Deltagere</span><strong>' + t.participants + '</strong></div>' +
        '<div class="summary-line"><span>Subtotal ekskl. moms</span><strong>' + Cart.formatMoney(t.subtotal_ex_vat) + '</strong></div>' +
        (t.discount_total ? '<div class="summary-line discount"><span>Rabat</span><strong>−' + Cart.formatMoney(t.discount_total) + '</strong></div>' : '') +
        '<div class="summary-line"><span>Moms (25%)</span><strong>' + Cart.formatMoney(t.vat_total) + '</strong></div>' +
      '</div>' +
      '<div class="summary-total"><span>I alt inkl. moms</span><strong>' + Cart.formatMoney(t.total_inc_vat) + '</strong></div>' +
      '<div class="summary-actions">' +
        '<a class="summary-primary" href="Checkout.html">Fortsæt til checkout <span>→</span></a>' +
        '<a class="summary-secondary" href="Kategorier.html">Tilføj flere kurser</a>' +
      '</div>' +
      '<p class="checkout-note">Du betaler ikke nu. Vi sender bekræftelse og betalingsinformation, når ordren er gennemgået.</p>' +
    '</aside>';
  }

  function emptyHTML() {
    return '<div class="shop-empty">' +
      '<h2>Kurven er tom</h2>' +
      '<p>Vælg et kursus, find den dato der passer dig, og læg holdet i kurven.</p>' +
      '<a class="summary-primary" href="Kategorier.html">Udforsk kurser <span>→</span></a>' +
    '</div>';
  }

  function render() {
    var items = Cart.getItems();
    Cart.updateBadges(items);
    if (!items.length) {
      root.innerHTML = emptyHTML();
      return;
    }
    root.innerHTML = '<div class="shop-layout">' +
      '<section class="shop-panel">' +
        '<h2>Valgte hold</h2>' +
        '<div class="cart-list">' + items.map(itemHTML).join('') + '</div>' +
      '</section>' +
      summaryHTML(items) +
    '</div>';
  }

  root.addEventListener('click', function (e) {
    var row = e.target.closest('[data-session-id]');
    if (!row) return;
    var sessionId = row.getAttribute('data-session-id');
    if (e.target.matches('[data-remove]')) {
      Cart.removeItem(sessionId);
      render();
      return;
    }
    if (e.target.matches('[data-qty]')) {
      var input = row.querySelector('[data-qty-input]');
      var next = Math.max(1, (parseInt(input.value, 10) || 1) + parseInt(e.target.dataset.qty, 10));
      Cart.setParticipants(sessionId, next);
      render();
    }
  });

  root.addEventListener('change', function (e) {
    if (!e.target.matches('[data-qty-input]')) return;
    var row = e.target.closest('[data-session-id]');
    Cart.setParticipants(row.getAttribute('data-session-id'), Math.max(1, parseInt(e.target.value, 10) || 1));
    render();
  });

  window.addEventListener('fm-cart-change', render);
  render();
})();
