/* ============================================================
   Express 4 does not forward rejected promises from async route
   handlers to the error middleware — wrap them so a throw/reject
   (validation httpError, DB error) still reaches the global JSON
   error handler in app.js.
   ============================================================ */
module.exports = function wrapAsync(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
