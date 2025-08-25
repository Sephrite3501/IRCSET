import { Router } from 'express';
import { standardLimiter } from '../middleware/rateLimiter.js';
import {
  csrfToken,
  register,
  login,
  me,
  refresh,
  logout,
} from '../controllers/authController.js';

const r = Router();

// NOTE: we mount this router at '/auth' in app.js
r.get('/csrf-token', csrfToken);           // GET /auth/csrf-token
r.post('/register', standardLimiter, register);
r.post('/login',    standardLimiter, login);
r.get('/me', me);
r.post('/refresh', refresh);               // CSRF enforced globally by app.js
r.post('/logout',  logout);                // CSRF enforced globally by app.js

export default r;
