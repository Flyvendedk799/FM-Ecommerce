/* ============================================================
   Dashboard stats — shared by GET /api/stats and
   GET /api/bookings/stats/summary.
   ============================================================ */
const db = require('./db');

function getStats() {
  return {
    total_courses:      db.prepare("SELECT COUNT(*) as n FROM courses WHERE status='active'").get().n,
    draft_courses:      db.prepare("SELECT COUNT(*) as n FROM courses WHERE status='draft'").get().n,
    total_suppliers:    db.prepare("SELECT COUNT(*) as n FROM suppliers WHERE status='active'").get().n,
    total_sessions:     db.prepare("SELECT COUNT(*) as n FROM sessions WHERE status='active'").get().n,
    pending_bookings:   db.prepare("SELECT COUNT(*) as n FROM bookings WHERE status='pending'").get().n,
    confirmed_bookings: db.prepare("SELECT COUNT(*) as n FROM bookings WHERE status='confirmed'").get().n,
    total_bookings:     db.prepare("SELECT COUNT(*) as n FROM bookings").get().n,
    new_inquiries:      db.prepare("SELECT COUNT(*) as n FROM inquiries WHERE status='new'").get().n,
    total_inquiries:    db.prepare("SELECT COUNT(*) as n FROM inquiries").get().n,
    recent_courses: db.prepare(`
      SELECT c.title, c.status, c.price, c.rating, s.name as supplier_name, cat.label as category_label
      FROM courses c
      LEFT JOIN suppliers s ON s.id = c.supplier_id
      LEFT JOIN categories cat ON cat.id = c.category_id
      ORDER BY c.created_at DESC LIMIT 5
    `).all(),
    recent_bookings: db.prepare(`
      SELECT b.*, c.title as course_title, sess.date, sess.location
      FROM bookings b
      LEFT JOIN sessions sess ON sess.id = b.session_id
      LEFT JOIN courses c ON c.id = sess.course_id
      ORDER BY b.created_at DESC LIMIT 5
    `).all(),
  };
}

module.exports = { getStats };
