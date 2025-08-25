// server/src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcrypt';
import ms from 'ms';
import crypto from 'crypto';
import { appDb } from '../db/pool.js';
import { standardLimiter } from '../middleware/rateLimiter.js';
import { cleanText, isEmail, isStrongPassword } from '../utils/validators.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';
import { authLoginsTotal } from '../utils/metrics.js';
import {
  generateAuthToken,
  saveSessionToken,
  findUserByToken,
  revokeToken,
  refreshTokenExpiry, // new helper added below
} from '../utils/tokenUtils.js';

const r = Router();

// Cookie flags
const secure = process.env.NODE_ENV === 'production';
const cookieBase = { httpOnly: true, sameSite: 'lax', secure, path: '/' };
const sessionTtlSec = Number(process.env.SESSION_TTL_SECONDS || 3600); // default 1h

function sessionFromCookie(req) {
  return req.cookies?.session_token || null;
}

// CSRF helper so the UI can read the token value
r.get('/csrf-token', (req, res) => {
  let token = req.cookies?.['csrf-token'] || null;
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    // Not httpOnly so frontend can read and echo it in header
    res.cookie('csrf-token', token, { sameSite: 'lax', secure, path: '/' });
  }
  return res.json({ csrfToken: token });
});

// Register (authors only)
r.post('/auth/register', standardLimiter, async (req, res) => {
  const traceId = `AUTH-REG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const email = isEmail(req.body?.email);
    const name = cleanText(req.body?.name, { max: 80 });
    const password = String(req.body?.password || '');

    if (!email || !name || !isStrongPassword(password)) {
      await logSecurityEvent({ traceId, action: 'auth.register.fail', severity: 'warn', details: { reason: 'validation' }, ip, userAgent });
      return res.status(400).json({ error: 'Invalid input' });
    }

    const exists = await appDb.query('SELECT 1 FROM users WHERE LOWER(email)=$1', [email]);
    if (exists.rowCount) {
      await logSecurityEvent({ traceId, action: 'auth.register.fail', severity: 'info', details: { reason: 'duplicate' }, ip, userAgent });
      return res.status(400).json({ error: 'Account already exists' });
    }

    const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 10));
    const ins = await appDb.query(
    `INSERT INTO users (email, password_hash, name, role, is_active)
    VALUES ($1,$2,$3,'author', true)
    RETURNING id, email, name, role, is_active`,
      [email, hash, name]
    );

    await logSecurityEvent({ traceId, actorUserId: ins.rows[0].id, action: 'auth.register.ok', severity: 'info', ip, userAgent });
    // No auto-login on register
    return res.json({ ok: true, user: ins.rows[0] });
  } catch (e) {
    await logSecurityEvent({ traceId, action: 'auth.register.error', severity: 'error', details: { message: e.message }, ip, userAgent });
    return res.status(500).json({ error: 'Server error' });
  }
});

// Login (all roles) — single DB session token
r.post('/auth/login', standardLimiter, async (req, res) => {
  const traceId = `AUTH-LOG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const email = isEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) {
      await logSecurityEvent({ traceId, action: 'auth.login.fail', severity: 'warn', details: { reason: 'validation' }, ip, userAgent });
      authLoginsTotal.labels('fail').inc();
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const q = await appDb.query(
      `SELECT id, email, password_hash, name, role, is_active
       FROM users WHERE LOWER(email)=$1`,
      [email]
    );
    const u = q.rows[0];

    if (!u || !u.is_active) {
      await logSecurityEvent({ traceId, action: 'auth.login.fail', severity: 'warn', details: { reason: 'not_found_or_inactive' }, ip, userAgent });
      authLoginsTotal.labels('fail').inc();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      await logSecurityEvent({ traceId, actorUserId: u?.id, action: 'auth.login.fail', severity: 'warn', details: { reason: 'bad_pw' }, ip, userAgent });
      authLoginsTotal.labels('fail').inc();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Optional: role-scoped categories
    let categories = [];
    if (['reviewer', 'decision_maker'].includes(u.role)) {
      const cq = await appDb.query(`SELECT category_id FROM user_categories WHERE user_id=$1`, [u.id]);
      categories = cq.rows.map(r => r.category_id);
    }

    // Create single-session token and persist it
    const token = generateAuthToken();
    await saveSessionToken({
      token,
      userId: u.id,
      role: u.role,
      ip,
      userAgent,
      expiresIn: sessionTtlSec,
      singleSession: true, // kick out old sessions for this user
    });

    // Set cookies
    res.cookie('session_token', token, { ...cookieBase, maxAge: ms(`${sessionTtlSec}s`) });

    // Ensure CSRF token exists for the UI (readable, not httpOnly)
    if (!req.cookies?.['csrf-token']) {
      const csrfVal = crypto.randomBytes(16).toString('hex');
      res.cookie('csrf-token', csrfVal, { sameSite: 'lax', secure, path: '/' });
    }

    await logSecurityEvent({ traceId, actorUserId: u.id, action: 'auth.login.ok', severity: 'info', ip, userAgent });
    authLoginsTotal.labels('success').inc();
    return res.json({ ok: true, user: { id: u.id, email: u.email, role: u.role, is_active: u.is_active, categories } });
  } catch (e) {
    await logSecurityEvent({ traceId, action: 'auth.login.error', severity: 'error', details: { message: e.message }, ip, userAgent });
    return res.status(500).json({ error: 'Server error' });
  }
});

// Me — uses DB session token
r.get('/auth/me', async (req, res) => {
  const token = sessionFromCookie(req);
  if (!token) return res.json({ user: null });

  const u = await findUserByToken(token);
  if (!u) return res.json({ user: null });

  let categories = [];
  if (['reviewer', 'decision_maker'].includes(u.role)) {
    const cq = await appDb.query(`SELECT category_id FROM user_categories WHERE user_id=$1`, [u.id]);
    categories = cq.rows.map(r => r.category_id);
  }

  return res.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, is_active: u.is_active, categories } });
});

// Refresh — extend expiry (sliding session window)
r.post('/auth/refresh', async (req, res) => {
  const token = sessionFromCookie(req);
  if (!token) return res.status(401).json({ error: 'No session' });

  const userId = await refreshTokenExpiry(token, sessionTtlSec);
  if (!userId) {
    res.clearCookie('session_token', cookieBase);
    return res.status(401).json({ error: 'Session expired' });
  }
  // Keep same cookie; just extended in DB
  return res.json({ ok: true });
});

// Logout — revoke token and clear cookie
r.post('/auth/logout', async (req, res) => {
  const token = sessionFromCookie(req);
  try {
    if (token) await revokeToken(token);
  } finally {
    res.clearCookie('session_token', cookieBase);
  }
  return res.json({ ok: true });
});

export default r;
