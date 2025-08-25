// server/src/middleware/requireAuth.js
import jwt from 'jsonwebtoken';
import { findUserByToken } from '../utils/tokenUtils.js';

export default async function requireAuth(req, res, next) {
  try {
    // 1) Cookie session (preferred)
    const sess = req.cookies?.session_token;
    if (sess) {
      const u = await findUserByToken(sess);
      if (u && u.is_active) {
        req.user = { uid: u.id, email: u.email, role: u.role };
        return next();
      }
    }

    // 2) Fallback: Bearer JWT (for any legacy callers)
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        req.user = { uid: payload.uid, role: payload.role, categories: payload.categories || [] };
        return next();
      } catch { /* ignore */ }
    }

    return res.status(401).json({ error: 'Unauthorized' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
