// Central error handler. Keeps prod responses terse; dev gets stack for 5xx
export function errorHandler(err, req, res, _next) {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  const payload = {
    error: err.message || 'Server error',
  };
  if (err.details) payload.details = err.details;

  // Don’t leak stack traces in production
  if (process.env.NODE_ENV !== 'production' && status >= 500) {
    payload.stack = err.stack;
  }

  if (status >= 500) {
    // You can swap to a structured logger here if you have one
    console.error('[api-error]', { status, url: req.originalUrl, msg: err.message, stack: err.stack });
  }

  res.status(status).json(payload);
}