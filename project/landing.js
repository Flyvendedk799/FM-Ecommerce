/* ============================================================
   FUTUREMATCH — landing.js
   Canvas bg, rotating word, count-up, scroll reveals
   ============================================================ */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- nav scrolled ---- */
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  /* ---- canvas particle network ---- */
  const canvas = document.getElementById('bg-canvas');
  if (canvas && !reduce) {
    const ctx = canvas.getContext('2d');
    let W, H, particles = [];
    const N = 40, MAX_DIST = 130, DOT_ALPHA = 0.5, LINE_ALPHA = 0.09;
    const COLOR = '237,230,214';

    function resize() {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }

    class P {
      constructor() {
        this.x = Math.random() * W;
        this.y = Math.random() * H;
        this.vx = (Math.random() - .5) * .22;
        this.vy = (Math.random() - .5) * .22;
        this.r = Math.random() * 1.4 + .7;
      }
      step() {
        this.x += this.vx; this.y += this.vy;
        if (this.x < 0 || this.x > W) this.vx *= -1;
        if (this.y < 0 || this.y > H) this.vy *= -1;
      }
    }

    function init() {
      resize();
      particles = Array.from({ length: N }, () => new P());
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // connections
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_DIST) {
            ctx.globalAlpha = (1 - d / MAX_DIST) * LINE_ALPHA;
            ctx.strokeStyle = `rgb(${COLOR})`;
            ctx.lineWidth = .8;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      // dots
      ctx.globalAlpha = DOT_ALPHA;
      ctx.fillStyle = `rgb(${COLOR})`;
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        p.step();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }

    window.addEventListener('resize', () => { resize(); }, { passive: true });
    init();
    draw();
  }

  /* ---- rotating word ---- */
  const rotEl = document.getElementById('rotating-word');
  if (rotEl && !reduce) {
    const words = ['kompetence', 'certificering', 'karriere', 'viden', 'fremtid'];
    let idx = 0;
    setInterval(() => {
      rotEl.classList.add('fade-out');
      setTimeout(() => {
        idx = (idx + 1) % words.length;
        rotEl.textContent = words[idx];
        rotEl.classList.remove('fade-out');
        rotEl.classList.add('fade-in');
        requestAnimationFrame(() => requestAnimationFrame(() => rotEl.classList.remove('fade-in')));
      }, 370);
    }, 3000);
  }

  /* ---- scroll reveals ---- */
  const revs = document.querySelectorAll('.reveal');
  if (reduce) {
    revs.forEach(r => r.classList.add('is-in'));
  } else {
    const check = () => {
      revs.forEach(r => {
        if (!r.classList.contains('is-in')) {
          const rect = r.getBoundingClientRect();
          if (rect.top < window.innerHeight * .91) r.classList.add('is-in');
        }
      });
    };
    check();
    let raf;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { check(); raf = null; });
    }, { passive: true });
    window.addEventListener('load', check);
    setTimeout(() => revs.forEach(r => r.classList.add('is-in')), 1800);
  }

  /* ---- count-up stats ---- */
  const statEls = document.querySelectorAll('.stat-num[data-target]');
  let counted = false;

  function runCount() {
    if (counted) return;
    const band = document.querySelector('.stats-band');
    if (!band) return;
    const r = band.getBoundingClientRect();
    if (r.top > window.innerHeight * .85) return;
    counted = true;

    statEls.forEach(el => {
      const target = parseInt(el.getAttribute('data-target'), 10);
      const plus = el.querySelector('.stat-plus');
      const plusHTML = plus ? plus.outerHTML : '';
      const dur = 1600;
      const start = Date.now();
      const tick = () => {
        const t = Math.min((Date.now() - start) / dur, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        const val = Math.round(ease * target);
        const fmt = val >= 1000 ? val.toLocaleString('da-DK') : String(val);
        el.innerHTML = fmt + plusHTML;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  window.addEventListener('scroll', runCount, { passive: true });
  window.addEventListener('load', runCount);
  setTimeout(runCount, 400);

  /* ---- smooth scroll for anchor links ---- */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    });
  });

  /* ---- live featured courses (top-rated from the catalog) ---- */
  (function loadFeatured() {
    const grid = document.querySelector('.featured-grid');
    if (!grid) return;
    const esc = s => String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const safeColor = v => /^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? v : '#2C1A0A';

    fetch('/api/courses?status=active')
      .then(r => r.ok ? r.json() : null)
      .then(courses => {
        if (!courses || !courses.length) return; // keep static fallback cards
        const featured = courses.slice()
          .sort((a, b) => (b.rating - a.rating) || ((b.review_count || 0) - (a.review_count || 0)))
          .slice(0, 4);

        grid.innerHTML = featured.map((c, i) => {
          const shortCat = (c.category_label || '').split(' ')[0] || 'Kursus';
          const rating = c.rating ? (+c.rating).toFixed(1).replace('.', ',') : '—';
          const price = c.price
            ? 'kr. ' + (+c.price).toLocaleString('da-DK') + '<small> ekskl. moms</small>'
            : '<span style="color:var(--accent)">Gratis*</span>';
          const d = i ? ' reveal-d' + i : '';
          return '<a class="rc-card reveal' + d + '" href="kursus.html?id=' + (+c.id) + '">' +
            '<div class="rc-top" style="background:' + safeColor(c.color) + '">' +
              '<span class="rc-cat">' + esc(shortCat) + '</span>' +
              '<span class="rc-rating"><span class="rc-star">★</span>' + rating + '</span>' +
              '<span class="rc-go">→</span>' +
            '</div>' +
            '<div class="rc-body">' +
              '<h3 class="rc-title">' + esc(c.title) + '</h3>' +
              '<div class="rc-supplier">' + esc(c.supplier_name || '') + '</div>' +
              '<div class="rc-foot">' +
                '<span class="rc-dur">' + esc(c.duration || '') + '</span>' +
                '<span class="rc-price">' + price + '</span>' +
              '</div>' +
            '</div>' +
          '</a>';
        }).join('');

        // reveal the freshly-injected cards (the global observer captured the old list)
        grid.querySelectorAll('.reveal').forEach((r, i) => {
          if (reduce) { r.classList.add('is-in'); return; }
          setTimeout(() => r.classList.add('is-in'), 60 + i * 70);
        });
      })
      .catch(() => { /* offline / API down — static cards remain */ });
  })();

})();
