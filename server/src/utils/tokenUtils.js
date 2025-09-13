// server/src/utils/tokenUtils.js
import crypto from 'crypto';
import { appDb } from '../db/pool.js';

/** Generate a secure random token */
export const generateAuthToken = () => crypto.randomBytes(64).toString('hex');

/** Save a new session token into the DB */
export const saveSessionToken = async ({
  token,
  userId,
  ip,
  userAgent,
  expiresIn = 3600,
  singleSession = true
}) => {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  if (singleSession) {
    await appDb.query(`DELETE FROM session_tokens WHERE user_id = $1`, [userId]);
  }

  await appDb.query(
    `INSERT INTO session_tokens (token, user_id, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [token, userId, ip, userAgent, expiresAt]
  );
};

/** Lookup token in DB and return user info (only if not expired) */
export const findUserByToken = async (token) => {
  const result = await appDb.query(
    `SELECT u.id, u.email, u.name, u.is_admin, u.is_active
       FROM session_tokens s
       JOIN users u ON s.user_id = u.id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  const user = result.rows[0];
  if (user) user.token = token;
  return user || null;
};

/** Remove a session token (logout) */
export const revokeToken = async (token) => {
  await appDb.query(`DELETE FROM session_tokens WHERE token = $1`, [token]);
};

/** Extend session expiry (sliding window). Returns user_id or null if expired/missing. */
export const refreshTokenExpiry = async (token, extendSeconds = 1800) => {
  const q = await appDb.query(
    `UPDATE session_tokens
        SET expires_at = NOW() + ($1::int * INTERVAL '1 second')
      WHERE token = $2 AND expires_at > NOW()
      RETURNING user_id`,
    [extendSeconds, token]
  );
  return q.rowCount ? q.rows[0].user_id : null;
};
