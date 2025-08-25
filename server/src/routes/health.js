// server/src/routes/health.js
import { Router } from 'express';
import { appDb } from '../db/pool.js';
import { register } from '../utils/metrics.js';

const r = Router();

r.get('/healthz', async (_req, res) => {
  try {
    await appDb.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'db_unreachable' });
  }
});

r.get('/readyz', async (_req, res) => {
  try {
    await appDb.query('SELECT 1');
    // You can add more checks here (disk, queue, etc.)
    res.json({ ok: true, deps: { db: 'ok' } });
  } catch {
    res.status(500).json({ ok: false, deps: { db: 'fail' } });
  }
});

// Optionally protect metrics with a bearer token if METRICS_TOKEN is set
r.get('/metrics', async (req, res) => {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const auth = (req.headers.authorization || '').trim();
    if (auth !== `Bearer ${token}`) {
      return res.status(401).send('unauthorized');
    }
  }
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

export default r;
