/* ============================================================
   Dashboard stats — shared by GET /api/stats and
   GET /api/bookings/stats/summary.
   ============================================================ */
const db = require('./db');

async function getStats() {
  return {
    total_courses:      (await db.get("SELECT COUNT(*) as n FROM courses WHERE status='active'")).n,
    draft_courses:      (await db.get("SELECT COUNT(*) as n FROM courses WHERE status='draft'")).n,
    total_suppliers:    (await db.get("SELECT COUNT(*) as n FROM suppliers WHERE status='active'")).n,
    total_sessions:     (await db.get("SELECT COUNT(*) as n FROM sessions WHERE status='active'")).n,
    pending_bookings:   (await db.get("SELECT COUNT(*) as n FROM bookings WHERE status='pending'")).n,
    confirmed_bookings: (await db.get("SELECT COUNT(*) as n FROM bookings WHERE status='confirmed'")).n,
    total_bookings:     (await db.get("SELECT COUNT(*) as n FROM bookings")).n,
    new_inquiries:      (await db.get("SELECT COUNT(*) as n FROM inquiries WHERE status='new'")).n,
    total_inquiries:    (await db.get("SELECT COUNT(*) as n FROM inquiries")).n,
    recent_courses: await db.all(`
      SELECT c.title, c.status, c.price, c.rating, s.name as supplier_name, cat.label as category_label
      FROM courses c
      LEFT JOIN suppliers s ON s.id = c.supplier_id
      LEFT JOIN categories cat ON cat.id = c.category_id
      ORDER BY c.created_at DESC LIMIT 5
    `),
    recent_bookings: await db.all(`
      SELECT b.*, c.title as course_title, sess.date, sess.location
      FROM bookings b
      LEFT JOIN sessions sess ON sess.id = b.session_id
      LEFT JOIN courses c ON c.id = sess.course_id
      ORDER BY b.created_at DESC LIMIT 5
    `),
  };
}

module.exports = { getStats };
