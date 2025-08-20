import { appDb } from '../db/pool.js';


export async function logSecurityEvent({ traceId, actorUserId, action, entityType, entityId, severity = 'info', details = {}, ip, userAgent }) {
try {
await appDb.query(
`INSERT INTO audit_logs (trace_id, actor_user_id, action, entity_type, entity_id, severity, details_json, ip, user_agent)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
[traceId, actorUserId || null, action, entityType || null, entityId || null, severity, JSON.stringify(details || {}), ip || null, userAgent || null]
);
} catch (e) {
console.error('[audit] failed', e.message);
}
}