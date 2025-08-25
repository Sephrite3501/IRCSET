// server/src/middleware/originGuard.js
// Blocks cross-site POST/PUT/PATCH/DELETE in production.
// Allows no-Origin (curl, native apps). Uses ALLOWED_ORIGIN or Host as allowlist.
export default function originGuard() {
  const isProd = process.env.NODE_ENV === 'production';
  const allowed = (process.env.ALLOWED_ORIGIN || '').trim(); // e.g., https://conf.example.org
  return (req, res, next) => {
    if (!isProd) return next(); // dev: skip
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';

    // Permit if no origin/referer (curl, server-to-server)
    if (!origin && !referer) return next();

    // Build baseline (Host header)
    const host = (req.headers.host || '').toLowerCase();
    const selfHttp = `http://${host}`;
    const selfHttps = `https://${host}`;

    const okList = [selfHttp, selfHttps];
    if (allowed) okList.push(allowed);

    const startsWithAllowed = (url) => okList.some(base => url.toLowerCase().startsWith(base));

    if ((origin && !startsWithAllowed(origin)) || (referer && !startsWithAllowed(referer))) {
      return res.status(403).json({ error: 'Cross-site request blocked' });
    }
    next();
  };
}
