// server/src/middleware/httpMetrics.js
import { httpRequestDuration } from '../utils/metrics.js';
import onFinished from 'on-finished';

export default function httpMetrics() {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    onFinished(res, () => {
      const end = process.hrtime.bigint();
      const seconds = Number(end - start) / 1e9;
      const route = res.locals?.matchedRoute || req.route?.path || req.path || 'unknown';
      httpRequestDuration
        .labels(req.method, route, String(res.statusCode))
        .observe(seconds);
    });
    next();
  };
}
