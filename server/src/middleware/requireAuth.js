// server/src/middleware/requireAuth.js
import jwt from 'jsonwebtoken';
import { findUserByToken } from '../utils/tokenUtils.js';

export default async function requireAuth(req, res, next) {
  try {
    const sess = req.cookies?.session_token;
    if (sess) {
      const u = await findUserByToken(sess);
      if (u && u.is_active) {
        req.user = {
          uid: u.id,
          email: u.email,
          name: u.name,
          is_admin: u.is_admin,   // ✅ include this
        };
        return next();
      }
    }

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        req.user = {
          uid: payload.uid,
          email: payload.email,
          is_admin: payload.is_admin || false, // ✅ default false
        };
        return next();
      } catch { /* ignore */ }
    }

    return res.status(401).json({ error: 'Unauthorized' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
