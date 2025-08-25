// server/src/utils/metrics.js
import client from 'prom-client';

const register = new client.Registry();

// Default process metrics
client.collectDefaultMetrics({ register });

// HTTP request duration
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDuration);

// Useful counters
export const authLoginsTotal = new client.Counter({
  name: 'auth_logins_total',
  help: 'Login attempts',
  labelNames: ['result'] // success|fail
});
register.registerMetric(authLoginsTotal);

export const reviewsSubmittedTotal = new client.Counter({
  name: 'reviews_submitted_total',
  help: 'Number of reviews successfully submitted'
});
register.registerMetric(reviewsSubmittedTotal);

export const decisionsMadeTotal = new client.Counter({
  name: 'decisions_made_total',
  help: 'Number of decisions (accepted/rejected)',
  labelNames: ['decision'] // accepted|rejected
});
register.registerMetric(decisionsMadeTotal);

export const finalUploadsTotal = new client.Counter({
  name: 'final_uploads_total',
  help: 'Number of final PDFs uploaded and accepted'
});
register.registerMetric(finalUploadsTotal);

export { register };
