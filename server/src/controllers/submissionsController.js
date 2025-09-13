// server/src/controllers/submissionsController.js
import path from 'path';
import fs from 'fs';
import { appDb } from '../db/pool.js';
import { cleanText, isEmail } from '../utils/validators.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

export async function createSubmission(req, res) {
  const traceId = `SUB-CRT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const uid = req.user?.uid;
  const eventId = Number(req.params.eventId || 0);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!eventId) return res.status(400).json({ error: 'Event ID required' });

  try {
    const title = cleanText(req.body?.title, { max: 200 });
    const maybeIrcEmail = req.body?.irc_member_email_optional
      ? isEmail(req.body.irc_member_email_optional)
      : null;

    if (!title || !req.file) {
      try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
      await logSecurityEvent({
        traceId,
        actorUserId: uid,
        action: 'submission.create.fail',
        severity: 'warn',
        details: { reason: 'validation', hasFile: !!req.file, title },
        ip,
        userAgent
      });
      return res.status(400).json({ error: 'Missing fields or file' });
    }

    // Move file under event folder
    const eventDir = path.resolve(process.cwd(), 'uploads', 'events', String(eventId));
    fs.mkdirSync(eventDir, { recursive: true });

    const targetPath = path.join(eventDir, path.basename(req.file.path));
    fs.renameSync(req.file.path, targetPath);
    const relPath = path.relative(process.cwd(), targetPath);

    // Insert into DB
    const ins = await appDb.query(
      `INSERT INTO submissions
         (event_id, author_user_id, title, abstract, keywords, pdf_path, status, irc_member_email_optional)
       VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7)
       RETURNING id, event_id, title, status, created_at`,
      [eventId, uid, title, null, null, relPath, maybeIrcEmail]
    );

    const row = ins.rows[0];
    await logSecurityEvent({
      traceId,
      actorUserId: uid,
      action: 'submission.create.ok',
      severity: 'info',
      details: { submission_id: row.id, eventId, file: path.basename(relPath) },
      ip,
      userAgent
    });

    return res.json({ ok: true, submission: row });
  } catch (e) {
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
    await logSecurityEvent({
      traceId,
      action: 'submission.create.error',
      severity: 'error',
      details: { message: e.message }
    });
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function listMySubmissions(req, res) {
  const uid = req.user?.uid;
  const eventId = Number(req.params.eventId || 0);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!eventId) return res.status(400).json({ error: 'Event ID required' });

  const rows = await appDb.query(
    `SELECT id, event_id, title, status, created_at, final_submitted_at
       FROM submissions
      WHERE author_user_id=$1 AND event_id=$2
      ORDER BY created_at DESC`,
    [uid, eventId]
  );
  return res.json({ items: rows.rows });
}

export async function getMySubmission(req, res) {
  const uid = req.user?.uid;
  const id = Number(req.params.id || 0);
  const eventId = Number(req.params.eventId || 0);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!id || !eventId) return res.status(400).json({ error: 'Bad id or event' });

  const q = await appDb.query(
    `SELECT id, event_id, title, status, created_at, final_submitted_at
       FROM submissions
      WHERE id=$1 AND author_user_id=$2 AND event_id=$3`,
    [id, uid, eventId]
  );

  const row = q.rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });

  return res.json({ submission: row });
}
