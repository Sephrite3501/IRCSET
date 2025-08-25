// Wraps async route handlers so thrown/rejected errors go to next(err)
export const asyncHandler = (fn) =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
