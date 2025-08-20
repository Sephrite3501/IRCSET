// server/src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { appDb } from '../db/pool.js';
import { standardLimiter } from '../middleware/rateLimiter.js';
import { cleanText, isEmail, isStrongPassword } from '../utils/validators.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

const r = Router();

function signToken({ id, role, categories = [] }) {
  const payload = { uid: id, role };
  // only include categories for reviewer/decision_maker
  if (['reviewer', 'decision_maker'].includes(role)) payload.categories = categories;
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });
}

// Register (authors only)
r.post('/auth/register', standardLimiter, async (req, res) => {
  const traceId = `AUTH-REG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const email = isEmail(req.body?.email);
    const name = cleanText(req.body?.name, { max: 80 });
    const password = req.body?.password;

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
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1,$2,$3,'author')
       RETURNING id, email, name, role`,
      [email, hash, name]
    );

    await logSecurityEvent({ traceId, actorUserId: ins.rows[0].id, action: 'auth.register.ok', severity: 'info', ip, userAgent });

    const token = signToken({ id: ins.rows[0].id, role: 'author' });
    return res.json({ token, user: ins.rows[0] });
  } catch (e) {
    await logSecurityEvent({ traceId, action: 'auth.register.error', severity: 'error', details: { message: e.message } });
    return res.status(500).json({ error: 'Server error' });
  }
});

// Login (all roles)
r.post('/auth/login', standardLimiter, async (req, res) => {
  const traceId = `AUTH-LOG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const email = isEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      await logSecurityEvent({ traceId, action: 'auth.login.fail', severity: 'warn', details: { reason: 'validation' }, ip, userAgent });
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const q = await appDb.query('SELECT id, email, password_hash, role FROM users WHERE LOWER(email)=$1 AND is_active=true', [email]);
    const u = q.rows[0];
    if (!u) {
      await logSecurityEvent({ traceId, action: 'auth.login.fail', severity: 'warn', details: { reason: 'not_found' }, ip, userAgent });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      await logSecurityEvent({ traceId, actorUserId: u.id, action: 'auth.login.fail', severity: 'warn', details: { reason: 'bad_pw' }, ip, userAgent });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Fetch categories only for reviewer/decision_maker
    let categories = [];
    if (['reviewer', 'decision_maker'].includes(u.role)) {
      const cq = await appDb.query(
        `SELECT category_id FROM user_categories WHERE user_id=$1`,
        [u.id]
      );
      categories = cq.rows.map(r => r.category_id);
    }

    const token = signToken({ id: u.id, role: u.role, categories });
    await logSecurityEvent({ traceId, actorUserId: u.id, action: 'auth.login.ok', severity: 'info', ip, userAgent });

    return res.json({
      token,
      user: { id: u.id, email: u.email, role: u.role, categories }
    });
  } catch (e) {
    await logSecurityEvent({ traceId, action: 'auth.login.error', severity: 'error', details: { message: e.message } });
    return res.status(500).json({ error: 'Server error' });
  }
});

// Me
r.get('/me', async (req, res) => {
  // no auth middleware here so the client can check gracefully
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.json({ user: null });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // pull fresh categories if needed
    let categories = payload.categories || [];
    if (['reviewer', 'decision_maker'].includes(payload.role)) {
      const cq = await appDb.query(`SELECT category_id FROM user_categories WHERE user_id=$1`, [payload.uid]);
      categories = cq.rows.map(r => r.category_id);
    }
    return res.json({ user: { uid: payload.uid, role: payload.role, categories } });
  } catch {
    return res.json({ user: null });
  }
});

export default r;
