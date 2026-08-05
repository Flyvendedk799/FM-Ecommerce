const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const wrapAsync = require('../middleware/wrapAsync');
const { httpError, intInRange, isEmail } = require('../validate');

function clean(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

/* ---- public: approved reviews for a course ---- */
router.get('/', wrapAsync(async (req, res) => {
  const courseId = intInRange(req.query.course_id, { min: 1, max: 10_000_000, field: 'course_id' });
  const rows = await db.all(`
    SELECT id, course_id, name, rating, comment, created_at
    FROM reviews
    WHERE course_id = ? AND status = 'approved'
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `, courseId);
  res.json(rows);
}));

/* ---- public: submit a review (one per e-mail per course) ---- */
router.post('/', wrapAsync(async (req, res) => {
  const body = req.body || {};
  const courseId = intInRange(body.course_id, { min: 1, max: 10_000_000, field: 'Kursus' });
  const rating = intInRange(body.rating, { min: 1, max: 5, field: 'Bedømmelse' });
  const email = clean(body.email, 180).toLowerCase();
  if (!isEmail(email)) throw httpError(400, 'En gyldig e-mail er påkrævet');
  const name = clean(body.name, 120);
  const comment = clean(body.comment, 1000);
  const orderReference = clean(body.order_reference, 60);

  const course = await db.get('SELECT id FROM courses WHERE id = ?', courseId);
  if (!course) throw httpError(404, 'Kurset findes ikke');

  const existing = await db.get('SELECT id FROM reviews WHERE course_id = ? AND email = ?', courseId, email);
  if (existing) {
    await db.run('UPDATE reviews SET rating = ?, comment = ?, name = ? WHERE id = ?', rating, comment, name, existing.id);
  } else {
    await db.run(`
      INSERT INTO reviews (course_id, order_reference, name, email, rating, comment, status)
      VALUES (?, ?, ?, ?, ?, ?, 'approved')
    `, courseId, orderReference, name, email, rating, comment);
  }

  // Real reviews replace whatever rating the catalog import shipped with.
  // Aggregated in JS so the same code runs on sqlite and pg.
  const agg = await db.get(
    "SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE course_id = ? AND status = 'approved'",
    courseId
  );
  await db.run('UPDATE courses SET rating = ?, review_count = ? WHERE id = ?',
    Math.round(Number(agg.avg) * 10) / 10, agg.n, courseId);

  res.status(201).json({ ok: true, updated: !!existing });
}));

/* ---- admin: hide/unhide or delete a review ---- */
router.put('/:id', requireAdmin, wrapAsync(async (req, res) => {
  const review = await db.get('SELECT * FROM reviews WHERE id = ?', req.params.id);
  if (!review) return res.status(404).json({ error: 'Not found' });
  const status = req.body.status === 'hidden' ? 'hidden' : 'approved';
  await db.run('UPDATE reviews SET status = ? WHERE id = ?', status, review.id);
  const agg = await db.get(
    "SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE course_id = ? AND status = 'approved'",
    review.course_id
  );
  await db.run('UPDATE courses SET rating = ?, review_count = ? WHERE id = ?',
    agg.n ? Math.round(Number(agg.avg) * 10) / 10 : 0, agg.n, review.course_id);
  res.json({ ok: true });
}));

module.exports = router;
