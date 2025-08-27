// server/src/middleware/rateLimit.js
import rateLimit from 'express-rate-limit';

// Default gentle limiter (per-IP)
export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 200,               // 200 requests / 15 min
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

// Stricter limiter for auth/login/register
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  limit: 20,                 // 20 attempts / 10 min
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try later' }
});

export const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,                      // tune per your traffic
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.'
});