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
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const title = cleanText(req.body?.title, { max: 200 });
    const categoryId = cleanText(req.body?.category_id, { max: 1 }).toUpperCase();
    const maybeIrcEmail = req.body?.irc_member_email_optional
      ? isEmail(req.body.irc_member_email_optional)
      : null;

    if (!title || !categoryId || !req.file) {
      // clean up saved file if present
      try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
      await logSecurityEvent({
        traceId, actorUserId: uid, action: 'submission.create.fail',
        severity: 'warn',
        details: { reason: 'validation', hasFile: !!req.file, title, categoryId },
        ip, userAgent
      });
      return res.status(400).json({ error: 'Missing fields or file' });
    }

    // Ensure category exists
    const cat = await appDb.query('SELECT 1 FROM categories WHERE id=$1', [categoryId]);
    if (!cat.rowCount) {
      try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Store a relative path for portability
    const relPath = path.relative(process.cwd(), req.file.path);

    const ins = await appDb.query(
      `INSERT INTO submissions
         (author_user_id, category_id, title, abstract, keywords, pdf_path, status, irc_member_email_optional)
       VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7)
       RETURNING id, category_id, title, status, created_at`,
      [
        uid,
        categoryId,
        title,
        null,          // abstract (MVP)
        null,          // keywords (MVP)
        relPath,       // uploads/<uuid>.pdf (relative)
        maybeIrcEmail
      ]
    );

    const row = ins.rows[0];
    await logSecurityEvent({
      traceId, actorUserId: uid, action: 'submission.create.ok',
      severity: 'info',
      details: { submission_id: row.id, categoryId, file: path.basename(relPath) },
      ip, userAgent
    });

    return res.json({ ok: true, submission: row });
  } catch (e) {
    // If Multer accepted but DB fails, try cleanup
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
    await logSecurityEvent({
      traceId, action: 'submission.create.error', severity: 'error',
      details: { message: e.message },
    });
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function listMySubmissions(req, res) {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const rows = await appDb.query(
    `SELECT id, category_id, title, status, created_at, final_submitted_at
       FROM submissions
      WHERE author_user_id=$1
      ORDER BY created_at DESC`,
    [uid]
  );
  return res.json({ items: rows.rows });
}

export async function getMySubmission(req, res) {
  const uid = req.user?.uid;
  const id = Number(req.params.id || 0);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!id) return res.status(400).json({ error: 'Bad id' });

  const q = await appDb.query(
    `SELECT id, category_id, title, status, created_at, final_submitted_at
       FROM submissions
      WHERE id=$1 AND author_user_id=$2`,
    [id, uid]
  );
  const row = q.rows[0];
  if (!row) return res.status(404).json({ error: 'Not found' });

  return res.json({ submission: row });
}
