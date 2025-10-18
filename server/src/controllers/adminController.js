// server/src/controllers/adminController.js
import { appDb } from '../db/pool.js';
import { ApiError } from '../lib/ApiError.js';
import { cleanText } from '../utils/validators.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

// Admin: create a new event
export async function createEvent(req, res) {
  const traceId = `ADM-EVT-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const name = cleanText(req.body?.name, { max: 120 });
  const description = cleanText(req.body?.description, { max: 500 });
  const startDate = req.body?.start_date || null;
  const endDate = req.body?.end_date || null;

  if (!name) throw new ApiError(400, 'Event name required');

  const ins = await appDb.query(
    `INSERT INTO events (name, description, start_date, end_date, created_by)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, name, description, start_date, end_date, created_at`,
    [name, description, startDate, endDate, req.user.uid]
  );
  const event = ins.rows[0];

  await logSecurityEvent({
    traceId, actorUserId: req.user.uid, action: 'admin.create_event', severity: 'info',
    details: { event_id: event.id, name },
    ip, userAgent
  });

  res.json({ ok: true, event });
}

// Admin: assign role in an event
export async function assignEventRole(req, res) {
  const traceId = `ADM-ASS-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const eventId = Number(req.params.eventId || 0);
  const userId = Number(req.body?.user_id || 0);
  const role = cleanText(req.body?.role, { max: 32 }).toLowerCase();

  if (!eventId || !userId || !['author','reviewer','chair'].includes(role)) {
    throw new ApiError(400, 'Invalid input');
  }

  try {
    const ins = await appDb.query(
      `INSERT INTO event_roles (event_id, user_id, role)
       VALUES ($1,$2,$3)
       ON CONFLICT (event_id, user_id, role) DO NOTHING
       RETURNING id, event_id, user_id, role`,
      [eventId, userId, role]
    );

    if (!ins.rowCount) {
      throw new ApiError(400, 'User already has this role in the event');
    }

    await logSecurityEvent({
      traceId, actorUserId: req.user.uid, action: 'admin.assign_event_role', severity: 'info',
      details: { event_id: eventId, user_id: userId, role },
      ip, userAgent
    });

    res.json({ ok: true, role: ins.rows[0] });
  } catch (e) {
    throw e;
  }
}

export async function unassignEventRole(req, res) {
  const traceId   = `ADM-UNAS-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const ip        = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const eventId = Number(req.params.eventId || 0);
  const userId  = Number(req.body?.user_id || 0);
  const role    = cleanText(req.body?.role, { max: 32 })?.toLowerCase();

  if (!eventId || !userId || !['author','reviewer','chair'].includes(role)) {
    await logSecurityEvent({
      traceId, actorUserId: req.user?.uid, action: 'admin.unassign_event_role.fail',
      severity: 'warn',
      details: { reason: 'validation', event_id: eventId || null, user_id: userId || null, role: role || null },
      ip, userAgent
    });
    throw new ApiError(400, 'Invalid input');
  }

  try {
    // Return the row so we can distinguish "not found"
    const del = await appDb.query(
      `DELETE FROM event_roles
       WHERE event_id = $1 AND user_id = $2 AND role = $3
       RETURNING id`,
      [eventId, userId, role]
    );

    if (!del.rowCount) {
      await logSecurityEvent({
        traceId, actorUserId: req.user.uid, action: 'admin.unassign_event_role.not_found',
        severity: 'warn',
        details: { event_id: eventId, user_id: userId, role },
        ip, userAgent
      });
      throw new ApiError(404, 'Assignment not found');
    }

    await logSecurityEvent({
      traceId, actorUserId: req.user.uid, action: 'admin.unassign_event_role.ok',
      severity: 'info',
      details: { event_id: eventId, user_id: userId, role },
      ip, userAgent
    });

    return res.json({ ok: true });
  } catch (e) {
    await logSecurityEvent({
      traceId, actorUserId: req.user?.uid, action: 'admin.unassign_event_role.error',
      severity: 'error',
      details: { message: e.message, event_id: eventId, user_id: userId, role },
      ip, userAgent
    });
    throw e; // let your asyncHandler/express error middleware shape the response
  }
}

// Admin: list all events
export async function listEvents(_req, res) {
  const q = await appDb.query(
    `SELECT id, name, description, start_date, end_date, created_at
     FROM events ORDER BY created_at DESC`
  );
  res.json({ items: q.rows });
}

// Admin: list users in an event
export async function listEventUsers(req, res) {
  const eventId = Number(req.params.eventId || 0);
  if (!eventId) throw new ApiError(400, 'Event ID required');

  const q = await appDb.query(
    `SELECT er.id, er.role, u.id AS user_id, u.email, u.name
     FROM event_roles er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id=$1
     ORDER BY er.role, u.name`,
    [eventId]
  );
  res.json({ items: q.rows });
}

export async function listAllUsers(req, res) {
  // parse filters
  const q = cleanText(req.query?.q, { max: 200 });
  const role = cleanText(req.query?.role, { max: 32 })?.toLowerCase();
  const eventId = Number(req.query?.event_id || 0) || null;

  const isAdmin =
    req.query?.is_admin === 'true' ? true :
    req.query?.is_admin === 'false' ? false : null;

  const isActive =
    req.query?.is_active === 'true' ? true :
    req.query?.is_active === 'false' ? false : null;

  const page = Math.max(1, parseInt(req.query?.page || '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query?.limit || '50', 10) || 50));
  const offset = (page - 1) * limit;

  // build WHERE for users
  const where = [];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    where.push(`(u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }
  if (isAdmin !== null) {
    params.push(isAdmin);
    where.push(`u.is_admin = $${params.length}`);
  }
  if (isActive !== null) {
    params.push(isActive);
    where.push(`u.is_active = $${params.length}`);
  }
  // role filter -> user must have that role (optionally within event)
  if (role) {
    params.push(role);
    const roleIdx = params.length;
    if (eventId) {
      params.push(eventId);
      const evIdx = params.length;
      where.push(`EXISTS (SELECT 1 FROM event_roles er WHERE er.user_id = u.id AND er.role = $${roleIdx} AND er.event_id = $${evIdx})`);
    } else {
      where.push(`EXISTS (SELECT 1 FROM event_roles er WHERE er.user_id = u.id AND er.role = $${roleIdx})`);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // total count (optional but nice)
  const cnt = await appDb.query(`SELECT COUNT(*)::int AS n FROM users u ${whereSql}`, params);
  const total = cnt.rows[0]?.n ?? 0;

  // page of users
  params.push(limit, offset);
  const limIdx = params.length - 1; // offset is last, limit is previous
  const usersRes = await appDb.query(
    `SELECT u.id, u.email, u.name, u.is_admin, u.is_active, u.created_at
       FROM users u
       ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT $${limIdx} OFFSET $${limIdx + 1}`,
    params
  );

  const users = usersRes.rows;
  const ids = users.map(u => u.id);

  // roles for these users (aggregated), optionally scoped to event_id
  let rolesMap = new Map();
  if (ids.length) {
    const params2 = [ids];
    let sql = `SELECT user_id, event_id, role FROM event_roles WHERE user_id = ANY($1)`;
    if (eventId) {
      params2.push(eventId);
      sql += ` AND event_id = $2`;
    }
    const r2 = await appDb.query(sql, params2);
    for (const row of r2.rows) {
      if (!rolesMap.has(row.user_id)) rolesMap.set(row.user_id, []);
      rolesMap.get(row.user_id).push({ event_id: row.event_id, role: row.role });
    }
  }

  const items = users.map(u => ({
    ...u,
    roles: rolesMap.get(u.id) || []
  }));

  await logSecurityEvent({
    traceId: `ADM-LU-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    actorUserId: req.user.uid,
    action: 'admin.list_users',
    severity: 'info',
    details: {
      total_returned: items.length,
      page, limit, filters: { q: !!q, role: role || null, eventId, isAdmin, isActive }
    }
  });

  res.json({ items, page, limit, total });
}