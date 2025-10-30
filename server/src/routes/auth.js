import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  csrfToken,
  register,
  loginRequest,
  loginVerify,
  me,
  refresh,
  logout,
  activateAccount,
} from '../controllers/authController.js';

import {
  validateSignup,
  validateLogin,
  validateResetRequest,
  validateNewPassword,
  validateOtp
} from '../validators/authValidator.js'

import { verifyCaptcha } from '../middleware/verifyCaptcha.js'
import { loginLimiter } from '../middleware/rateLimiter.js'
import  requireAuth  from '../middleware/requireAuth.js'
import { revokeToken } from '../utils/tokenUtils.js'

const r = Router();

// Mounted at /auth in app.js 
r.get('/csrf-token', csrfToken);  // GET /auth/csrf-token
r.post('/register', authLimiter, verifyCaptcha, register);

r.post('/login', loginLimiter ?? authLimiter, verifyCaptcha, validateLogin, loginRequest);
r.post('/verify-otp', authLimiter, validateOtp, loginVerify);

r.get('/activate', activateAccount);

r.get('/me', requireAuth, me);
r.post('/refresh', requireAuth, refresh); // CSRF handled globally in app.js
r.post('/logout', logout); // CSRF handled globally in app.js





export default r;
