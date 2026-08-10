// Express 4 does not catch rejected promises from async route handlers —
// an unhandled rejection crashes the whole process instead of returning a
// 500. Every async route is wrapped with this so one bad request can't take
// the server down. Real fix, since libSQL made every DB call async.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
