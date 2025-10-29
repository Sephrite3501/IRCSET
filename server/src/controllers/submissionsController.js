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
    // Extract and sanitize fields
    const title = cleanText(req.body?.title, { max: 200 });
    const abstract = cleanText(req.body?.abstract || '', { max: 2000 });
    const keywords = cleanText(req.body?.keywords || '', { max: 300 });

    const maybeIrcEmail = req.body?.irc_email
      ? (isEmail(req.body.irc_email) ? req.body.irc_email : null)
      : null;

    // Handle authors (from frontend JSON string)
    let authors = [];
    if (req.body?.authors) {
      try {
        const parsed = JSON.parse(req.body.authors);
        if (Array.isArray(parsed)) {
          authors = parsed
            .filter(a => a && typeof a.name === "string" && a.name.trim())
            .map(a => ({
              name: cleanText(a.name.trim(), { max: 100 }),
              email: a.email && isEmail(a.email) ? a.email.trim() : null,
              organization:
                a.organization && typeof a.organization === "string"
                  ? cleanText(a.organization.trim(), { max: 150 })
                  : null
            }));
        }
      } catch {
        authors = [];
      }
    }

    // Validate core fields
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
      return res.status(400).json({ error: 'Missing title or PDF file' });
    }

    // --- File Handling ---
    const eventDir = path.resolve(process.cwd(), 'uploads', 'events', String(eventId));
    fs.mkdirSync(eventDir, { recursive: true });

    const targetPath = path.join(eventDir, path.basename(req.file.path));
    fs.renameSync(req.file.path, targetPath);
    const relPath = path.relative(process.cwd(), targetPath);

    // --- Database Insert ---
    const ins = await appDb.query(
      `INSERT INTO submissions
         (event_id, author_user_id, title, abstract, keywords, authors, pdf_path, status, irc_member_email_optional)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted',$8)
       RETURNING id, event_id, title, status, created_at`,
      [
        eventId,
        uid,
        title,
        abstract || null,
        keywords || null,
        JSON.stringify(authors || []),
        relPath,
        maybeIrcEmail
      ]
    );

    const row = ins.rows[0];

    await logSecurityEvent({
      traceId,
      actorUserId: uid,
      action: 'submission.create.ok',
      severity: 'info',
      details: {
        submission_id: row.id,
        eventId,
        file: path.basename(relPath),
        authorsCount: authors.length
      },
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
      details: { message: e.message, stack: e.stack }
    });
    return res.status(500).json({ error: 'Server error' });
  }
}


export async function listMySubmissions(req, res) {
  const uid = req.user?.uid;
  const eventId = Number(req.params.eventId || 0);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!eventId) return res.status(400).json({ error: 'Event ID required' });

  try {
    const q = await appDb.query(
      `SELECT 
         id,
         event_id,
         title,
         abstract,
         keywords,
         authors,
         status,
         created_at,
         final_submitted_at
       FROM submissions
      WHERE author_user_id = $1 AND event_id = $2
      ORDER BY created_at DESC`,
      [uid, eventId]
    );

    // Parse JSON safely
    const items = q.rows.map(r => ({
      ...r,
      authors: Array.isArray(r.authors) ? r.authors : safeJson(r.authors)
    }));

    return res.json({ items });
  } catch (err) {
    console.error("listMySubmissions error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export async function getMySubmission(req, res) {
  const uid = req.user?.uid;
  const id = Number(req.params.id || 0);
  const eventId = Number(req.params.eventId || 0);
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!id || !eventId) return res.status(400).json({ error: 'Bad id or event' });

  try {
    const q = await appDb.query(
      `SELECT 
         id,
         event_id,
         title,
         abstract,
         keywords,
         authors,
         pdf_path,
         status,
         irc_member_email_optional,
         created_at,
         final_submitted_at
       FROM submissions
      WHERE id = $1 AND author_user_id = $2 AND event_id = $3
      LIMIT 1`,
      [id, uid, eventId]
    );

    const row = q.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });

    // Normalize JSON authors
    row.authors = Array.isArray(row.authors) ? row.authors : safeJson(row.authors);

    return res.json({ submission: row });
  } catch (err) {
    console.error("getMySubmission error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// --- helper for safe JSON parsing ---
function safeJson(v) {
  try {
    if (v && typeof v === "string") return JSON.parse(v);
    if (v && typeof v === "object") return v;
    return [];
  } catch {
    return [];
  }
}

