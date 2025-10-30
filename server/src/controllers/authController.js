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

import { validationResult } from 'express-validator';
import { sendOtpEmail, sendActivationEmail, sendResetPasswordEmail } from '../services/emailService.js';

const LOCK_WINDOW_MS = Number(process.env.LOGIN_LOCK_WINDOW_MS || 10 * 60 * 1000);
const LOCK_FAILS     = Number(process.env.LOGIN_LOCK_FAILS     || 5);

const secure = process.env.NODE_ENV === 'production';
const cookieBase = { httpOnly: true, sameSite: 'lax', secure:false, path: '/' };
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



export async function me(req, res) {
  const token = sessionFromCookie(req);
  if (!token) return res.json({ user: null });

  const u = await findUserByToken(token);
  if (!u) return res.json({ user: null });

  const rolesRes = await appDb.query(
    `SELECT DISTINCT role FROM event_roles WHERE user_id = $1`,
    [u.id]
  );
  const roles = rolesRes.rows.map(r => r.role);

  return res.json({
    user: { id: u.id, email: u.email, name: u.name, is_admin: u.is_admin, is_active: u.is_active, roles }
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

export const activateAccount = async (req, res) => {
  const traceId = `ACTIVATE-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const token = req.query.token;

  if (!token) {
    await logSecurityEvent({ action: 'activate_account', details: 'Missing activation token', refId: traceId, req });
    return res.status(400).json({ message: `Invalid activation link. (Ref: ${traceId})` });
  }

  try {
    const result = await appDb.query(`
      SELECT user_id, expires_at, used
      FROM activation_tokens
      WHERE token = $1
    `, [token]);

    if (result.rows.length === 0) {
      await logSecurityEvent({ action: 'activate_account', details: 'Invalid token', refId: traceId, req });
      return res.status(400).json({ message: `Invalid activation link. (Ref: ${traceId})` });
    }

    const { user_id, expires_at, used } = result.rows[0];
    if (used) {
      await logSecurityEvent({ userId: user_id, action: 'activate_account', details: 'Token already used', refId: traceId, req });
      return res.status(400).json({ message: `This link has already been used. (Ref: ${traceId})` });
    }
    if (new Date(expires_at) < new Date()) {
      await logSecurityEvent({ userId: user_id, action: 'activate_account', details: 'Token expired', refId: traceId, req });
      return res.status(400).json({ message: `Activation link expired. (Ref: ${traceId})` });
    }

    await appDb.query(`UPDATE users SET account_status='active', is_active=true, updated_at=NOW() WHERE id=$1`, [user_id]);
    await appDb.query(`UPDATE activation_tokens SET used=true WHERE token=$1`, [token]);

    await logSecurityEvent({ userId: user_id, action: 'activate_account', details: 'Account activated', refId: traceId, req });
    return res.status(200).json({ message: 'Account activated.' });
  } catch (err) {
    console.error(`[ACTIVATE] Error (Ref: ${traceId})`, err);
    await logSecurityEvent({ action: 'activate_account', details: `Unhandled error: ${err.message}`, refId: traceId, req });
    return res.status(500).json({ message: `Activation failed. Please try again. (Ref: ${traceId})` });
  }
};

export async function loginRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const traceId   = `LOGIN-REQ-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const { email, password } = req.body;
  const ip        = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const { rows } = await appDb.query(
      `SELECT id, email, name, password_hash, is_admin, is_active, account_status
         FROM users WHERE LOWER(email)=LOWER($1)`,
      [email]
    );
    const user = rows[0];

    const validPw = user && await bcrypt.compare(String(password || ''), user.password_hash);
    const success = Boolean(validPw);

    // write attempt
    await appDb.query(`
      INSERT INTO login_attempts (email, success, ip_address, user_agent)
      VALUES ($1, $2, $3, $4)
    `, [email, success, ip, userAgent]);

    // lockout on repeated fails in last window
    if (!success) {
      const since = new Date(Date.now() - LOCK_WINDOW_MS);
      const { rows: cntRows } = await appDb.query(
        `SELECT COUNT(*)::int AS n
           FROM login_attempts
          WHERE email = $1 AND success = false AND created_at > $2`,
        [email, since]
      );
      const failCount = cntRows[0]?.n ?? 0;

      if (failCount >= LOCK_FAILS && user) {
        await appDb.query(
          `UPDATE users SET account_status='locked', updated_at=NOW() WHERE id=$1`,
          [user.id]
        );
        await logSecurityEvent({ traceId, userEmail: email, action: 'login_lockout', severity: 'warn', ip, userAgent });
        return res.status(403).json({ error: 'Account locked due to repeated login failures. Please contact support.' });
      }

      await logSecurityEvent({ traceId, userEmail: email, action: 'auth.login.fail', severity: 'warn', ip, userAgent });
      authLoginsTotal.labels('fail').inc?.();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // block inactive/locked
    if (!user.is_active || user.account_status === 'locked') {
      await logSecurityEvent({ traceId, actorUserId: user.id, action: 'auth.login.blocked', severity: 'warn', ip, userAgent });
      return res.status(403).json({ error: 'Account not allowed to log in.' });
    }

    // create OTP (hashing optional; plain shown for brevity)
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await appDb.query(`
      INSERT INTO login_otp (email, code, expires_at)
      VALUES ($1,$2,$3)
      ON CONFLICT (email) DO UPDATE SET code=EXCLUDED.code, expires_at=EXCLUDED.expires_at, created_at=NOW()
    `, [email, otp, expires]);

    // send email
    try {
      await sendOtpEmail(email, otp, user.name);
    } catch (e) {
      // if email fails, don't disclose details
      return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }

    await logSecurityEvent({ traceId, actorUserId: user.id, action: 'auth.login.otp_sent', severity: 'info', ip, userAgent });
    return res.json({ success: true, message: 'OTP sent to email' });
  } catch (e) {
    await logSecurityEvent({ traceId, action: 'auth.login.error', severity: 'error', details: { message: e.message }, ip, userAgent });
    return res.status(500).json({ error: 'Server error' });
  }
}

// Step 2: verify OTP -> issue session cookie (using your existing helpers)
export async function loginVerify(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const traceId   = `LOGIN-VER-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const { email, otp } = req.body;
  const ip        = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const { rows: uRows } = await appDb.query(
      `SELECT id, email, name, is_admin, is_active, account_status
         FROM users WHERE LOWER(email)=LOWER($1)`,
      [email]
    );
    const user = uRows[0];
    if (!user || !user.is_active || user.account_status === 'locked') {
      await logSecurityEvent({ traceId, userEmail: email, action: 'auth.login.verify.blocked', severity: 'warn', ip, userAgent });
      return res.status(403).json({ error: 'Account not allowed to log in.' });
    }

    const { rows: oRows } = await appDb.query(
      `SELECT code, expires_at FROM login_otp WHERE email=$1`,
      [email]
    );
    const rec = oRows[0];
    if (!rec || new Date(rec.expires_at) < new Date()) {
      await logSecurityEvent({ traceId, userEmail: email, action: 'auth.login.verify.expired', severity: 'warn', ip, userAgent });
      return res.status(400).json({ error: 'OTP expired or invalid.' });
    }

    const ok = String(otp || '') === rec.code; // replace with bcrypt.compare if you store hashed
    if (!ok) {
      await logSecurityEvent({ traceId, userEmail: email, action: 'auth.login.verify.bad_otp', severity: 'warn', ip, userAgent });
      return res.status(401).json({ error: 'Invalid OTP.' });
    }

    // one-time use
    await appDb.query(`DELETE FROM login_otp WHERE email=$1`, [email]);

    // ---- issue session using your existing helpers/vars ----
    const token = generateAuthToken();
    await saveSessionToken({
      token,
      userId: user.id,
      ip,
      userAgent,
      expiresIn: sessionTtlSec,
      singleSession: true
    });

    res.cookie('session_token', token, { ...cookieBase, maxAge: ms(`${sessionTtlSec}s`) });

    if (!req.cookies?.['csrf-token']) {
      const csrfVal = crypto.randomBytes(16).toString('hex');
      res.cookie('csrf-token', csrfVal, { sameSite: 'lax', secure, path: '/' });
    }

    await logSecurityEvent({ traceId, actorUserId: user.id, action: 'auth.login.ok', severity: 'info', ip, userAgent });
    authLoginsTotal.labels('success').inc?.();

    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin, is_active: user.is_active }
    });
  } catch (e) {
    await logSecurityEvent({ traceId, userEmail: email, action: 'auth.login.verify.error', severity: 'error', details: { message: e.message }, ip, userAgent });
    return res.status(500).json({ error: 'Server error' });
  }
}