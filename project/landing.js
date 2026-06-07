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

})();
