// server/src/middleware/requireEventRole.js
import { appDb } from '../db/pool.js';

/**
 * Resolve eventId from:
 *  - req.params.eventId
 *  - req.body.event_id
 *  - a submission lookup via req.params.id or req.params.submissionId
 */
async function resolveEventId(req) {
  // 1) Straight from params / body
  const direct =
    Number(req.params?.eventId || req.body?.event_id || 0);
  if (direct) return direct;

  // 2) Infer via submission id in the route
  const sid = Number(req.params?.submissionId || req.params?.id || 0);
  if (sid) {
    const q = await appDb.query(
      'SELECT event_id FROM submissions WHERE id=$1',
      [sid]
    );
    if (q.rowCount) return Number(q.rows[0].event_id);
  }

  return 0;
}

/**
 * Middleware to enforce event-scoped roles.
 * Usage: router.post('/:eventId/..', requireAuth, requireEventRole('chair'), handler)
 */
export function requireEventRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      // Admins are allowed as chair everywhere (and bypass checks)
      if (req.user?.is_admin) {
        // Still attach eventRoles so downstream code that inspects roles works
        req.user.eventRoles = Array.from(new Set([...(req.user.eventRoles || []), 'chair']));
        return next();
      }

      const eventId = await resolveEventId(req);
      if (!eventId) {
        return res.status(400).json({ error: 'Event ID required' });
      }

      const q = await appDb.query(
        'SELECT role FROM event_roles WHERE event_id=$1 AND user_id=$2',
        [eventId, req.user.uid]
      );
      const roles = q.rows.map(r => r.role);

      // Attach roles for downstream use
      req.user.eventRoles = roles;

      // If no specific roles were requested, allow through
      if (!allowedRoles?.length) return next();

      const ok = roles.some(r => allowedRoles.includes(r));
      if (!ok) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
