import rateLimit from 'express-rate-limit';
export const standardLimiter = rateLimit({
windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 600000),
max: Number(process.env.RATE_LIMIT_MAX || 100)
});