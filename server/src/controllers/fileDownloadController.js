// server/src/controllers/fileDownloadController.js
import path from 'path';
import fs from 'fs';
import { appDb } from '../db/pool.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

const FINAL_BASE = path.resolve(process.cwd(), 'uploads', 'final');

function startsWithDir(fullPath, baseDir) {
  const rel = path.relative(baseDir, fullPath);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function canUserSeeFinal(reqUser, submissionId, authorUserId) {
  if (!reqUser) return false;
  if (reqUser.uid === authorUserId) return true;
  if (reqUser.role === 'chair' || reqUser.role === 'decision_maker') return true;

  if (reqUser.role === 'reviewer') {
    const a = await appDb.query(
      `SELECT 1 FROM assignments WHERE submission_id=$1 AND reviewer_user_id=$2`,
      [submissionId, reqUser.uid]
    );
    return a.rowCount > 0;
  }
  return false;
}

/** GET /submissions/:id/final.pdf (append ?dl=1 to force download) */
export async function getFinalPdf(req, res) {
  const traceId = `FINAL-DL-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const sid = Number(req.params.id || 0);
  const forceDownload = req.query.dl === '1' || req.query.download === '1';

  try {
    if (!sid) return res.status(400).json({ error: 'Bad submission id' });

    const q = await appDb.query(
      `SELECT id, author_user_id, status, final_pdf_path FROM submissions WHERE id=$1`,
      [sid]
    );
    if (!q.rowCount) return res.status(404).json({ error: 'Not found' });
    const sub = q.rows[0];

    if (!sub.final_pdf_path || sub.status !== 'final_submitted') {
      return res.status(409).json({ error: 'Final not available' });
    }

    const allowed = await canUserSeeFinal(req.user, sid, sub.author_user_id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const stored = path.normalize(sub.final_pdf_path); // e.g. uploads/final/xxx.pdf
    const full = path.resolve(process.cwd(), stored);

    if (!startsWithDir(full, FINAL_BASE)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (!fs.existsSync(full)) {
      return res.status(410).json({ error: 'File missing' });
    }

    const stat = fs.statSync(full);
    const filename = path.basename(full);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader(
      'Content-Disposition',
      (forceDownload ? 'attachment' : 'inline') + `; filename="${filename}"`
    );

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
      fs.createReadStream(full, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(full).pipe(res);
    }

    // fire-and-forget audit
    logSecurityEvent({
      traceId,
      actorUserId: req.user.uid,
      action: 'final.download',
      severity: 'info',
      entity_type: 'submission',
      entity_id: String(sid),
      details: { filename, size: stat.size, disposition: forceDownload ? 'attachment' : 'inline' }
    }).catch(() => {});
  } catch (_e) {
    return res.status(500).json({ error: 'Server error' });
  }
}
