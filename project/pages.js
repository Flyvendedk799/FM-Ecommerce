/* ============================================================
   FUTUREMATCH — pages.js
   Shared behaviour for content/info pages:
   nav scroll, reveals, FAQ accordion, inquiry form submission.
   ============================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- nav scrolled ---- */
  var nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 30);
    }, { passive: true });
  }

  /* ---- scroll reveals ---- */
  var revs = document.querySelectorAll('.reveal');
  if (reduce) {
    revs.forEach(function (r) { r.classList.add('is-in'); });
  } else {
    var check = function () {
      revs.forEach(function (r) {
        if (!r.classList.contains('is-in') && r.getBoundingClientRect().top < window.innerHeight * 0.92)
          r.classList.add('is-in');
      });
    };
    check();
    var raf;
    window.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { check(); raf = null; });
    }, { passive: true });
    setTimeout(function () { revs.forEach(function (r) { r.classList.add('is-in'); }); }, 1600);
  }

  /* ---- FAQ accordion ---- */
  var faqUid = 0;
  // Helper to mark a question button's expanded state for AT.
  function setFaqExpanded(item, expanded) {
    var b = item.querySelector('.faq-q-btn');
    if (b) b.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  document.querySelectorAll('.faq-q-btn').forEach(function (btn) {
    var item = btn.closest('.faq-q');
    var ans  = item ? item.querySelector('.faq-a') : null;
    // a11y wiring: aria-expanded reflects open state; aria-controls links the answer.
    btn.setAttribute('aria-expanded', item && item.classList.contains('open') ? 'true' : 'false');
    if (ans) {
      if (!ans.id) ans.id = 'faq-a-' + (++faqUid);
      btn.setAttribute('aria-controls', ans.id);
    }
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-q');
      var ans  = item.querySelector('.faq-a');
      var open = item.classList.contains('open');
      // close siblings within the same group
      var group = item.closest('.faq-group') || document;
      group.querySelectorAll('.faq-q.open').forEach(function (o) {
        o.classList.remove('open');
        setFaqExpanded(o, false);
        var a = o.querySelector('.faq-a');
        if (a) a.style.maxHeight = '0px';
      });
      if (!open) {
        item.classList.add('open');
        setFaqExpanded(item, true);
        ans.style.maxHeight = ans.scrollHeight + 'px';
      }
    });
  });
  // open a FAQ targeted by hash (e.g. #afbestilling) — getElementById never
  // throws on fragments like #q=excel%20avanceret, unlike querySelector.
  var rawHash = window.location.hash;
  if (rawHash && rawHash.length > 1) {
    var hashItem = document.getElementById(rawHash.slice(1));
    if (hashItem && hashItem.classList.contains('faq-q')) {
      hashItem.classList.add('open');
      setFaqExpanded(hashItem, true);
      var a = hashItem.querySelector('.faq-a');
      if (a) a.style.maxHeight = a.scrollHeight + 'px';
      setTimeout(function () { hashItem.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }, 120);
    }
  }

  /* ---- inquiry form (Kontakt / Firmahold) ---- */
  var form = document.getElementById('inquiry-form');
  if (form) {
    // preset subject from ?emne= query (e.g. Bliv udbyder)
    var params = new URLSearchParams(window.location.search);
    var emne = params.get('emne');
    var subjEl = document.getElementById('if-subject');
    if (emne && subjEl) {
      var map = {
        udbyder: 'Bliv udbyder på Futurematch',
        firmahold: 'Firmahold / skræddersyet forløb',
        amu: 'AMU — er jeg berettiget?',
      };
      var value = map[emne] || emne;
      // the contact <select> only has fixed options — add a match or fall back to "Andet"
      if (subjEl.tagName === 'SELECT') {
        var opt = Array.prototype.find.call(subjEl.options, function (o) { return o.value === value || o.text === value; });
        subjEl.value = opt ? opt.value : (Array.prototype.some.call(subjEl.options, function(o){return o.text==='Andet';}) ? 'Andet' : subjEl.value);
      } else {
        subjEl.value = value;
      }
    }

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var submitBtn = form.querySelector('.fc-submit');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var emailEl = document.getElementById('if-email');
      var email = emailEl ? emailEl.value.trim() : '';
      if (!email || !EMAIL_RE.test(email)) {
        if (emailEl) { emailEl.classList.add('invalid'); emailEl.focus(); }
        return;
      }

      var payload = {
        type:    form.dataset.type || 'contact',
        name:    val('if-name'),
        email:   email,
        phone:   val('if-phone'),
        company: val('if-company'),
        subject: val('if-subject'),
        message: val('if-message'),
      };
      var partEl = document.getElementById('if-participants');
      if (partEl && partEl.value) payload.participants = parseInt(partEl.value, 10) || null;

      submitBtn.disabled = true;
      var originalHTML = submitBtn.innerHTML;
      submitBtn.innerHTML = 'Sender…';

      fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.d.error || 'Noget gik galt');
          showSuccess(payload.email);
        })
        .catch(function (err) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalHTML;
          alert('Beskeden kunne ikke sendes: ' + err.message + '\nPrøv igen, eller ring til os på 70 30 01 23.');
        });
    });

    // clear invalid state on input
    form.querySelectorAll('.fc-input, .fc-textarea').forEach(function (el) {
      el.addEventListener('input', function () { el.classList.remove('invalid'); });
    });

    function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

    function showSuccess(email) {
      var card = document.getElementById('inquiry-card') || form.parentElement;
      card.innerHTML =
        '<div class="form-success">' +
          '<div class="fs-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>' +
          '<h3>Tak for din besked!</h3>' +
          '<p>Vi har modtaget din henvendelse og vender tilbage til <b>' + escHtml(email) + '</b> hurtigst muligt — typisk inden for én hverdag.</p>' +
        '</div>';
    }
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
