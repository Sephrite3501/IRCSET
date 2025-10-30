// server/src/utils/logSecurityEvent.js
import { appDb } from '../db/pool.js';
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined,                               // no pid/hostname noise
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {                                      // prevent secrets in logs
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password', '*.password', 'token', '*.token',
      'session_token', '*.session_token'
    ],
    remove: true
  }
});

const SEVERITY = new Set(['info', 'warn', 'error', 'debug']);

// Shallow sanitize + redact obvious secrets; trim huge strings
function sanitizeDetails(input) {
  const MAX_STR = 1000; // cap any single string field
  const REDACT = new Set(['password', 'token', 'session_token', 'authorization', 'cookie', 'set-cookie']);
  const out = {};

  try {
    const src = (input && typeof input === 'object') ? input : { value: input };
    for (const [k, v] of Object.entries(src)) {
      const key = String(k).toLowerCase();
      if (REDACT.has(key)) { out[k] = '[REDACTED]'; continue; }

      if (typeof v === 'string') {
        out[k] = v.length > MAX_STR ? (v.slice(0, MAX_STR) + `…[trimmed ${v.length - MAX_STR}]`) : v;
      } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
        out[k] = v;
      } else if (v instanceof Date) {
        out[k] = v.toISOString();
      } else if (Array.isArray(v)) {
        out[k] = v.slice(0, 100); // avoid giant arrays
      } else if (typeof v === 'object') {
        // one-level shallow copy to avoid circulars
        const o = {};
        for (const [kk, vv] of Object.entries(v)) {
          if (typeof vv === 'string') {
            o[kk] = vv.length > MAX_STR ? (vv.slice(0, MAX_STR) + '…[trimmed]') : vv;
          } else if (typeof vv === 'number' || typeof vv === 'boolean' || vv === null) {
            o[kk] = vv;
          } else {
            o[kk] = '[object]';
          }
        }
        out[k] = o;
      } else {
        out[k] = '[unserializable]';
      }
    }
  } catch {
    return { note: 'details_sanitize_error' };
  }
  return out;
}

/**
 * Audit logger
 * @param {Object} args
 * @param {string} args.traceId
 * @param {number=} args.actorUserId
 * @param {string} args.action
 * @param {string=} args.entityType
 * @param {string|number=} args.entityId
 * @param {'info'|'warn'|'error'|'debug'=} args.severity
 * @param {Object=} args.details
 * @param {string=} args.ip
 * @param {string=} args.userAgent
 * @param {import('express').Request=} args.req   // optional: auto-populate ip/ua/reqId
 */
export async function logSecurityEvent({
  traceId,
  actorUserId,
  action,
  entityType,
  entityId,
  severity = 'info',
  details = {},
  ip,
  userAgent,
  req
}) {
  const sev = SEVERITY.has(severity) ? severity : 'info';

  // Derive from req if provided
  const derivedIp = ip || req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || null;
  const derivedUa = userAgent || req?.headers?.['user-agent'] || null;

  // Attach reqId (from requestId middleware) if present
  const fullDetails = {
    ...sanitizeDetails(details),
    ...(req?.id ? { reqId: req.id } : {})
  };

  try {
    await appDb.query(
      `INSERT INTO audit_logs
         (trace_id, actor_user_id, action, entity_type, entity_id, severity, details, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        traceId || null,
        actorUserId || null,
        action,
        entityType || null,
        entityId != null ? String(entityId) : null,
        sev,
        JSON.stringify(fullDetails),
        typeof derivedIp === 'string' ? derivedIp : null,
        typeof derivedUa === 'string' ? derivedUa : null
      ]
    );

    // Emit to app logs too (helps when DB is slow/unreachable)
    logger[sev]({
      traceId,
      actorUserId,
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : undefined,
      details: fullDetails
    }, 'audit_log');
  } catch (e) {
    // Never throw from audit path
    logger.error({ err: e, traceId, action }, '[audit] insert failed');
  }
}
