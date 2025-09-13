// server/src/controllers/authController.js
import bcrypt from 'bcrypt';
import ms from 'ms';
import crypto from 'crypto';
import { appDb } from '../db/pool.js';
import { cleanText, isEmail, isStrongPassword } from '../utils/validators.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';
import { authLoginsTotal } from '../utils/metrics.js';
import {
  generateAuthToken,
  saveSessionToken,
  findUserByToken,
  revokeToken,
  refreshTokenExpiry,
} from '../utils/tokenUtils.js';

const secure = process.env.NODE_ENV === 'production';
const cookieBase = { httpOnly: true, sameSite: 'lax', secure, path: '/' };
const sessionTtlSec = Number(process.env.SESSION_TTL_SECONDS || 3600);

function sessionFromCookie(req) {
  return req.cookies?.session_token || null;
}

export async function csrfToken(req, res) {
  let token = req.cookies?.['csrf-token'] || null;
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    res.cookie('csrf-token', token, { sameSite: 'lax', secure, path: '/' });
  }
  return res.json({ csrfToken: token });
}

export async function register(req, res) {
  const traceId = `AUTH-REG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const email = (isEmail(req.body?.email) || '').toLowerCase();
    const name = cleanText(req.body?.name, { max: 80 });
    const password = String(req.body?.password || '');

    if (!email || !name || !isStrongPassword(password)) {
      await logSecurityEvent({ traceId, action: 'auth.register.fail', severity: 'warn', details: { reason: 'validation' }, ip, userAgent });
      return res.status(400).json({ error: 'Invalid input' });
    }

    const exists = await appDb.query('SELECT 1 FROM users WHERE LOWER(email)=LOWER($1)', [email]);
    if (exists.rowCount) {
      await logSecurityEvent({ traceId, action: 'auth.register.fail', severity: 'info', details: { reason: 'duplicate' }, ip, userAgent });
      return res.status(400).json({ error: 'Account already exists' });
    }

    const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 10));
    const ins = await appDb.query(
      `INSERT INTO users (email, password_hash, name, is_admin, is_active)
       VALUES ($1,$2,$3,false,true)
       RETURNING id, email, name, is_admin, is_active`,
      [email, hash, name]
    );

    await logSecurityEvent({ traceId, actorUserId: ins.rows[0].id, action: 'auth.register.ok', severity: 'info', ip, userAgent });
    return res.json({ ok: true, user: ins.rows[0] });
  } catch (e) {
    await logSecurityEvent({ traceId, action: 'auth.register.error', severity: 'error', details: { message: e.message }, ip, userAgent });
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function login(req, res) {
  const traceId = `AUTH-LOG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const email = (isEmail(req.body?.email) || '').toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      await logSecurityEvent({ traceId, action: 'auth.login.fail', severity: 'warn', details: { reason: 'validation' }, ip, userAgent });
      authLoginsTotal.labels('fail').inc();
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const q = await appDb.query(
      `SELECT id, email, password_hash, name, is_admin, is_active
       FROM users WHERE LOWER(email)=LOWER($1)`,
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

    const token = generateAuthToken();
    await saveSessionToken({
      token,
      userId: u.id,
      ip,
      userAgent,
      expiresIn: sessionTtlSec,
      singleSession: true,
    });

    res.cookie('session_token', token, { ...cookieBase, maxAge: ms(`${sessionTtlSec}s`) });

    if (!req.cookies?.['csrf-token']) {
      const csrfVal = crypto.randomBytes(16).toString('hex');
      res.cookie('csrf-token', csrfVal, { sameSite: 'lax', secure, path: '/' });
    }

    await logSecurityEvent({ traceId, actorUserId: u.id, action: 'auth.login.ok', severity: 'info', ip, userAgent });
    authLoginsTotal.labels('success').inc();

    return res.json({
      ok: true,
      user: { id: u.id, email: u.email, name: u.name, is_admin: u.is_admin, is_active: u.is_active }
    });
  } catch (e) {
    await logSecurityEvent({ traceId, action: 'auth.login.error', severity: 'error', details: { message: e.message }, ip, userAgent });
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function me(req, res) {
  const token = sessionFromCookie(req);
  if (!token) return res.json({ user: null });

  const u = await findUserByToken(token);
  if (!u) return res.json({ user: null });

  return res.json({
    user: { id: u.id, email: u.email, name: u.name, is_admin: u.is_admin, is_active: u.is_active }
  });
}

export async function refresh(req, res) {
  const token = sessionFromCookie(req);
  if (!token) return res.status(401).json({ error: 'No session' });

  const userId = await refreshTokenExpiry(token, sessionTtlSec);
  if (!userId) {
    res.clearCookie('session_token', cookieBase);
    return res.status(401).json({ error: 'Session expired' });
  }
  res.cookie('session_token', token, { ...cookieBase, maxAge: ms(`${sessionTtlSec}s`) });
  return res.json({ ok: true });
}

export async function logout(req, res) {
  const token = sessionFromCookie(req);
  try {
    if (token) await revokeToken(token);
  } finally {
    res.clearCookie('session_token', cookieBase);
    res.clearCookie('csrf-token', { sameSite: 'lax', secure, path: '/' });
  }
  return res.json({ ok: true });
}
