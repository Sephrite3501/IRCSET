// server/src/middleware/requireEventRole.js
import { appDb } from '../db/pool.js';

/**
 * Middleware to enforce event-scoped roles.
 * Example:
 *   router.post('/:eventId/submissions', requireAuth, requireEventRole('author'), submitPaper);
 */
export function requireEventRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const eventId = Number(req.params.eventId || req.body?.event_id || 0);
      if (!eventId) {
        return res.status(400).json({ error: 'Event ID required' });
      }

      const q = await appDb.query(
        `SELECT role FROM event_roles WHERE event_id=$1 AND user_id=$2`,
        [eventId, req.user.uid]
      );

      const roles = q.rows.map(r => r.role);
      if (!roles.some(r => allowedRoles.includes(r))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Attach event roles to request for downstream use
      req.user.eventRoles = roles;
      next();
    } catch (err) {
      next(err);
    }
  };
}
