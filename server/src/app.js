import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
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
import admin from './routes/admin.js';
import users from './routes/users.js';
import finalRoutes from './routes/final.js';
import fileDownloadRouter from './routes/fileDownload.js';
import eventsRouter from './routes/event.js';
import externalRoutes from './routes/external.js';
import { fileURLToPath } from 'url'; 

import dotenv from 'dotenv';
dotenv.config();

function envList(name, fallback = []) {
  const v = process.env[name];
  if (!v || typeof v !== 'string') return fallback;
  return v.split(',').map(s => s.trim()).filter(Boolean);
}
function envStr(name, fallback = '') {
  return (process.env[name] ?? fallback);
}
function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

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

const ALLOWED_ORIGINS = envList('CORS_ORIGINS', [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

const normalize = (s) => (s || '').replace(/\/+$/, '');
const ALLOWED_NORMALIZED = ALLOWED_ORIGINS.map(normalize);

const corsOptions = {
  origin(origin, cb) {
    if (!origin || ALLOWED_NORMALIZED.includes(normalize(origin))) return cb(null, true);
    const err = new Error('Not allowed by CORS'); err.status = 403; return cb(err);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  // 👇 add your custom header(s)
  allowedHeaders: ['Content-Type','Authorization','X-CSRF-Token','X-Captcha-Token','X-Requested-With'],
  exposedHeaders: ['Set-Cookie']
};



app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(err.status || 403).json({ error: 'CORS blocked for this origin' });
  }
  next(err);
});

app.use(
  ['/auth','/submissions','/reviewer','/chair','/admin'],
  (req, res, next) => {
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
    next();
  }
);

app.disable('x-powered-by');

app.use(cookieParser());
app.use(issueCsrf);
app.use(originGuard());

app.use(
  ['/auth/logout','/auth/refresh','/submissions','/reviewer','/chair','/admin','/final','/submissions/:id/final'],
  requireCsrf
);

app.use(httpMetrics());

// Resolve absolute path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 👇 Serve uploaded PDFs and other static files
const uploadsDir = path.resolve(process.cwd(), 'uploads');


// Rate limits
app.use(standardLimiter);
app.use('/auth', authLimiter);

// Routes
app.use(health);
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath) === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    }
  }
}));
app.use('/auth', auth);
app.use('/submissions', submissions);
app.use('/chair', chair);
app.use('/reviewer', reviewer);
app.use('/admin', admin);
app.use('/final', finalRoutes);
app.use(fileDownloadRouter);
app.use('/events', eventsRouter);
app.use('/users', users);
app.use("/external", externalRoutes);




app.get('/', (req, res) => res.json({ name: 'IRCSET API' }));

export default app;
