import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  csrfToken,
  register,
  login,
  me,
  refresh,
  logout,
} from '../controllers/authController.js';

const r = Router();

// Mounted at /auth in app.js
r.get('/csrf-token', csrfToken);     // GET /auth/csrf-token
r.post('/register', authLimiter, register);
r.post('/login',    authLimiter, login);
r.get('/me', me);
r.post('/refresh', refresh);         // CSRF handled globally in app.js
r.post('/logout',  logout);          // CSRF handled globally in app.js

export default r;
