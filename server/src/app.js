import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import httpMetrics from './middleware/httpMetrics.js';
import originGuard from './middleware/originGuard.js';
import { standardLimiter, authLimiter } from './middleware/rateLimiter.js';

import { issueCsrf, requireCsrf } from './middleware/csrf.js';

import health from './routes/health.js';
import auth from './routes/auth.js';
import submissions from './routes/submissions.js';
import chair from './routes/chair.js';
import reviewer from './routes/reviewer.js';
import decisions from './routes/decisions.js';
import admin from './routes/admin.js';
import finalRoutes from './routes/final.js';
import fileDownloadRouter from './routes/fileDownload.js';

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "frame-ancestors": ["'none'"],
      "img-src": ["'self'", "data:"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "connect-src": ["'self'"]
    }
  },
  referrerPolicy: { policy: "no-referrer" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" }
}));

if (process.env.NODE_ENV === 'production') {
  app.use(helmet.hsts({ maxAge: 15552000, includeSubDomains: true, preload: true }));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
const corsOptions = {
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    const err = new Error('Not allowed by CORS'); err.status = 403; return cb(err);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-CSRF-Token']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(err.status || 403).json({ error: 'CORS blocked for this origin' });
  }
  next(err);
});

app.use(['/auth','/submissions','/reviews','/decisions','/chair','/admin'], (req, res, next) => {
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  next();
});

app.disable('x-powered-by');

app.use(cookieParser());
app.use(issueCsrf);
app.use(originGuard());

app.use(
  ['/auth/logout','/auth/refresh','/submissions','/reviews','/decisions','/chair','/admin','/final','/submissions/:id/final'],
  requireCsrf
);

app.use(httpMetrics());

// Rate limits
app.use(standardLimiter);
app.use('/auth', authLimiter);

// Routes
app.use(health);
app.use(auth);
app.use(submissions);
app.use(chair);
app.use(reviewer);
app.use(decisions);
app.use('/admin', admin);
app.use(finalRoutes);
app.use(fileDownloadRouter);

app.get('/', (req, res) => res.json({ name: 'IRCSET API' }));

export default app;
