import path from 'path';
import fs from 'fs';
import { appDb } from '../db/pool.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

// safe path checker (prevents escaping the base dir)
function startsWithDir(fullPath, baseDir) {
  const rel = path.relative(baseDir, fullPath);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Permission check (shared):
 * - Author can see their own submission.
 * - Chair can see any in the same event.
 * - Reviewer can see only if assigned to that submission.
 */
async function canUserSeeSubmission(reqUser, submissionId) {
  if (!reqUser) return false;

  const s = await appDb.query(
    `SELECT event_id, author_user_id FROM submissions WHERE id=$1`,
    [submissionId]
  );
  if (!s.rowCount) return false;
  const { event_id, author_user_id } = s.rows[0];

  if (reqUser.uid === author_user_id) return true;

  const er = await appDb.query(
    `SELECT role FROM event_roles WHERE event_id=$1 AND user_id=$2`,
    [event_id, reqUser.uid]
  );
  const roles = er.rows.map(r => r.role);

  if (roles.includes('chair')) return true;

  if (roles.includes('reviewer')) {
    const a = await appDb.query(
      `SELECT 1 FROM assignments WHERE submission_id=$1 AND reviewer_user_id=$2`,
      [submissionId, reqUser.uid]
    );
    return a.rowCount > 0;
  }

  return false;
}

/** Stream helper with Range support + headers */
function streamPdf({ req, res, fullPath, filename, traceId, actorUserId, action, entityId, forceDownload }) {
  const stat = fs.statSync(fullPath);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Content-Disposition', (forceDownload ? 'attachment' : 'inline') + `; filename="${filename}"`);

  const range = req.headers.range;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (!m) return res.status(416).end();
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (isNaN(start) || isNaN(end) || start > end || end >= stat.size) {
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    fs.createReadStream(fullPath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(fullPath).pipe(res);
  }

  // fire-and-forget audit log
  logSecurityEvent({
    traceId,
    actorUserId,
    action,
    severity: 'info',
    entity_type: 'submission',
    entity_id: String(entityId),
    details: {
      filename,
      size: stat.size,
      disposition: forceDownload ? 'attachment' : 'inline'
    }
  }).catch(() => {});
}

/** GET initial (first) submission PDF */
export async function getInitialPdf(req, res) {
  const traceId = `INIT-DL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const sid = Number(req.params.id || 0);
  const forceDownload = req.query.dl === '1' || req.query.download === '1';

  try {
    if (!sid) return res.status(400).json({ error: 'Bad submission id' });

    const q = await appDb.query(
      `SELECT id, event_id, author_user_id, pdf_path
         FROM submissions WHERE id=$1`,
      [sid]
    );
    if (!q.rowCount) return res.status(404).json({ error: 'Not found' });
    const sub = q.rows[0];

    // permission
    const allowed = await canUserSeeSubmission(req.user, sid);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    // initial PDFs live under: uploads/events/:eventId/...
    const baseDir = path.resolve(process.cwd(), 'uploads', 'events', String(sub.event_id));
    const stored = path.normalize(sub.pdf_path || ''); // already stored relative like uploads/events/:eid/xxx.pdf
    const full = path.resolve(process.cwd(), stored);

    if (!startsWithDir(full, baseDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (!fs.existsSync(full)) {
      return res.status(410).json({ error: 'File missing' });
    }

    const filename = path.basename(full);
    streamPdf({
      req, res,
      fullPath: full,
      filename,
      traceId,
      actorUserId: req.user.uid,
      action: 'initial.download',
      entityId: sid,
      forceDownload
    });
  } catch (_e) {
    return res.status(500).json({ error: 'Server error' });
  }
}

/** GET final submission PDF */
export async function getFinalPdf(req, res) {
  const traceId = `FINAL-DL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const sid = Number(req.params.id || 0);
  const forceDownload = req.query.dl === '1' || req.query.download === '1';

  try {
    if (!sid) return res.status(400).json({ error: 'Bad submission id' });

    const q = await appDb.query(
      `SELECT id, event_id, author_user_id, status, final_pdf_path
         FROM submissions WHERE id=$1`,
      [sid]
    );
    if (!q.rowCount) return res.status(404).json({ error: 'Not found' });
    const sub = q.rows[0];

    if (!sub.final_pdf_path || sub.status !== 'final_submitted') {
      return res.status(409).json({ error: 'Final not available' });
    }

    // permission
    const allowed = await canUserSeeSubmission(req.user, sid);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    // finals live under: uploads/events/:eventId/final/...
    const baseDir = path.resolve(process.cwd(), 'uploads', 'events', String(sub.event_id), 'final');
    const stored = path.normalize(sub.final_pdf_path);
    const full = path.resolve(process.cwd(), stored);

    if (!startsWithDir(full, baseDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (!fs.existsSync(full)) {
      return res.status(410).json({ error: 'File missing' });
    }

    const filename = path.basename(full);
    streamPdf({
      req, res,
      fullPath: full,
      filename,
      traceId,
      actorUserId: req.user.uid,
      action: 'final.download',
      entityId: sid,
      forceDownload
    });
  } catch (_e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
