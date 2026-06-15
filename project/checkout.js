(function () {
  'use strict';

  var Cart = window.FuturematchCart;
  var root = document.getElementById('checkout-root');
  var nav = document.getElementById('nav');

  window.addEventListener('scroll', function () {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function emptyHTML() {
    return '<div class="shop-empty">' +
      '<h2>Kurven er tom</h2>' +
      '<p>Du skal vælge mindst ét kursushold, før du kan gennemføre checkout.</p>' +
      '<a class="summary-primary" href="Kategorier.html">Find kurser <span>→</span></a>' +
    '</div>';
  }

  function reviewHTML(items) {
    return '<div class="checkout-review">' + items.map(function (item) {
      return '<div class="checkout-review-item">' +
        '<strong>' + esc(item.course_title) + '</strong>' +
        '<span>' + esc(Cart.formatDate(item.date) + ' · ' + item.location + ' · ' + item.participants + ' deltager' + (item.participants === 1 ? '' : 'e')) + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function summaryHTML(items) {
    var t = Cart.totals(items);
    return '<aside class="summary-card">' +
      '<h2>Ordre</h2>' +
      reviewHTML(items) +
      '<div class="summary-lines">' +
        '<div class="summary-line"><span>Subtotal ekskl. moms</span><strong>' + Cart.formatMoney(t.subtotal_ex_vat) + '</strong></div>' +
        (t.discount_total ? '<div class="summary-line discount"><span>Rabat</span><strong>−' + Cart.formatMoney(t.discount_total) + '</strong></div>' : '') +
        '<div class="summary-line"><span>Moms (25%)</span><strong>' + Cart.formatMoney(t.vat_total) + '</strong></div>' +
      '</div>' +
      '<div class="summary-total"><span>I alt inkl. moms</span><strong>' + Cart.formatMoney(t.total_inc_vat) + '</strong></div>' +
      '<p class="checkout-note">Pladserne reserveres som afventende, indtil Futurematch har bekræftet ordren.</p>' +
    '</aside>';
  }

  function formHTML(items) {
    return '<div class="shop-layout">' +
      '<section class="shop-panel">' +
        '<h2>Dine oplysninger</h2>' +
        '<form class="checkout-form" id="checkout-form" novalidate>' +
          '<div id="checkout-error" class="checkout-error" hidden></div>' +
          '<section class="checkout-section">' +
            '<h3>Kontaktperson</h3>' +
            '<div class="checkout-grid">' +
              '<div class="checkout-field"><label for="co-name">Navn <span class="req">*</span></label><input id="co-name" autocomplete="name" required></div>' +
              '<div class="checkout-field"><label for="co-email">E-mail <span class="req">*</span></label><input id="co-email" type="email" autocomplete="email" required></div>' +
              '<div class="checkout-field"><label for="co-company">Virksomhed</label><input id="co-company" autocomplete="organization"></div>' +
              '<div class="checkout-field"><label for="co-phone">Telefon</label><input id="co-phone" type="tel" autocomplete="tel"></div>' +
            '</div>' +
          '</section>' +
          '<section class="checkout-section">' +
            '<h3>Fakturering</h3>' +
            '<div class="checkout-grid">' +
              '<div class="checkout-field full"><label for="co-address">Adresse</label><input id="co-address" autocomplete="billing street-address"></div>' +
              '<div class="checkout-field"><label for="co-zip">Postnr.</label><input id="co-zip" autocomplete="billing postal-code"></div>' +
              '<div class="checkout-field"><label for="co-city">By</label><input id="co-city" autocomplete="billing address-level2"></div>' +
              '<div class="checkout-field"><label for="co-vat">CVR / VAT</label><input id="co-vat"></div>' +
              '<div class="checkout-field"><label for="co-ean">EAN</label><input id="co-ean" inputmode="numeric"></div>' +
            '</div>' +
          '</section>' +
          '<section class="checkout-section">' +
            '<h3>Betalingsønske</h3>' +
            '<div class="payment-grid">' +
              payOption('faktura', 'Faktura', true) +
              payOption('ean', 'EAN') +
              payOption('kort', 'Kortlink') +
              payOption('mobilepay', 'MobilePay-link') +
            '</div>' +
            '<p class="checkout-note">Der trækkes ingen betaling i checkout. Vi sender betalingsinformation, når ordren er bekræftet.</p>' +
          '</section>' +
          '<section class="checkout-section">' +
            '<div class="checkout-field full"><label for="co-notes">Note til ordren</label><textarea id="co-notes" placeholder="F.eks. særlige fakturaoplysninger eller deltagernavne."></textarea></div>' +
          '</section>' +
          '<button class="summary-primary" type="submit" id="checkout-submit">Send ordre <span>→</span></button>' +
        '</form>' +
      '</section>' +
      summaryHTML(items) +
    '</div>';
  }

  function payOption(value, label, checked) {
    return '<label class="payment-option">' +
      '<input type="radio" name="payment" value="' + value + '"' + (checked ? ' checked' : '') + '>' +
      '<span>' + label + '</span>' +
    '</label>';
  }

  function showError(message) {
    var el = document.getElementById('checkout-error');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function validateRequired() {
    var name = document.getElementById('co-name');
    var email = document.getElementById('co-email');
    if (!name.value.trim()) { name.focus(); showError('Navn er påkrævet.'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      email.focus(); showError('Indtast en gyldig e-mail.'); return false;
    }
    return true;
  }

  async function submitOrder(e) {
    e.preventDefault();
    if (!validateRequired()) return;
    var items = Cart.getItems();
    if (!items.length) { render(); return; }

    var submit = document.getElementById('checkout-submit');
    submit.disabled = true;
    submit.textContent = 'Sender ordre...';

    var payload = {
      customer: {
        name: val('co-name'),
        email: val('co-email'),
        company: val('co-company'),
        phone: val('co-phone'),
      },
      billing: {
        address: val('co-address'),
        zip: val('co-zip'),
        city: val('co-city'),
        country: 'Danmark',
        vat_number: val('co-vat'),
        ean: val('co-ean'),
      },
      payment_method: document.querySelector('input[name="payment"]:checked')?.value || 'faktura',
      notes: val('co-notes'),
      items: items.map(function (item) {
        return { session_id: item.session_id, participants: item.participants };
      }),
    };

    try {
      var res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Ordren kunne ikke oprettes');
      Cart.clear();
      showSuccess(data.order, payload.customer.email);
    } catch (err) {
      submit.disabled = false;
      submit.innerHTML = 'Send ordre <span>→</span>';
      showError(err.message || 'Ordren kunne ikke oprettes. Prøv igen.');
    }
  }

  function showSuccess(order, email) {
    root.innerHTML = '<div class="checkout-success">' +
      '<div class="checkout-success-icon">✓</div>' +
      '<h2>Ordren er sendt</h2>' +
      '<p>Vi har reserveret dine valgte pladser og sender en bekræftelse til <b>' + esc(email) + '</b> inden for 24 timer.</p>' +
      '<div class="order-reference"><span>Ordrenummer</span><strong>' + esc(order.reference) + '</strong></div>' +
      '<div class="summary-actions" style="max-width:360px;margin:28px auto 0">' +
        '<a class="summary-primary" href="Kategorier.html">Se flere kurser</a>' +
        '<a class="summary-secondary" href="Kontakt.html">Kontakt os</a>' +
      '</div>' +
    '</div>';
    Cart.updateBadges([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    var items = Cart.getItems();
    Cart.updateBadges(items);
    root.innerHTML = items.length ? formHTML(items) : emptyHTML();
    document.getElementById('checkout-form')?.addEventListener('submit', submitOrder);
  }

  render();
})();
