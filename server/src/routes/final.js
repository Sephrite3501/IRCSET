// server/src/routes/final.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import requireAuth from '../middleware/requireAuth.js';
import { appDb } from '../db/pool.js';
import { uploadPdf as _unused } from '../middleware/uploadPdf.js'; // keep existing upload guard available if you want same dir
import { checkMembershipByEmail } from '../services/membershipCheck.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

const r = Router();

// Separate storage for final PDFs (uploads/final)
const finalDir = 'uploads/final';
if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, finalDir),
  filename: (req, file, cb) => {
    // keep .pdf extension; filenames are opaque
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const uploadFinalPdf = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const okMime = file.mimetype === 'application/pdf';
    const okExt = path.extname(file.originalname).toLowerCase() === '.pdf';
    if (!okMime || !okExt) return cb(new Error('PDF only'));
    cb(null, true);
  }
});

/**
 * POST /submissions/:id/final
 * - Author-only (must own the submission)
 * - Submission must be in status 'final_required'
 * - Runs IRC membership check using submissions.irc_member_email_optional if present,
 *   otherwise the author's own account email
 * - On success -> save file path to submissions.final_pdf_path, set final_submitted_at, status 'final_submitted'
 * - On failure/unconfigured/error -> block and record in membership_validations
 * Body: multipart/form-data with 'pdf' field
 */
r.post(
  '/submissions/:id/final',
  requireAuth, // author token required
  uploadFinalPdf.single('pdf'),
  async (req, res) => {
    const traceId = `FINAL-UP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    try {
      const uid = req.user?.uid;
      const sid = Number(req.params.id || 0);
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      if (!sid) return res.status(400).json({ error: 'Bad id' });
      if (!req.file) return res.status(400).json({ error: 'PDF file required' });

      // Load submission
      const sq = await appDb.query(
        `SELECT id, author_user_id, status, irc_member_email_optional
           FROM submissions
          WHERE id=$1`,
        [sid]
      );
      const sub = sq.rows[0];
      if (!sub) return res.status(404).json({ error: 'Not found' });
      if (sub.author_user_id !== uid) {
        return res.status(403).json({ error: 'Not your submission' });
      }
      if (sub.status !== 'final_required') {
        return res.status(400).json({ error: `Status=${sub.status}, cannot upload final` });
      }

      // Determine which email to validate: optional field or author's own email
      let emailToCheck = sub.irc_member_email_optional || null;
      if (!emailToCheck) {
        const uq = await appDb.query('SELECT email FROM users WHERE id=$1', [uid]);
        emailToCheck = uq.rows[0]?.email || null;
      }

      // Perform membership check (RO connection to IRC DB)
      const result = await checkMembershipByEmail(emailToCheck);
      // result: { ok: boolean, meta?: { account_status, is_paid, paid_until }, reason?: 'unconfigured'|'error', error?:string }

      // Record the check
      await appDb.query(
        `INSERT INTO membership_validations (submission_id, checked_email, result, paid_until)
         VALUES ($1,$2,$3,$4)`,
        [
          sid,
          emailToCheck,
          result.ok ? 'valid' : (result.reason || 'invalid'),
          result.meta?.paid_until || null
        ]
      );

      if (!result.ok) {
        await logSecurityEvent({
          traceId,
          actorUserId: uid,
          action: 'final.check_failed',
          entityType: 'submission',
          entityId: String(sid),
          severity: 'warn',
          details: { reason: result.reason || 'invalid', email: emailToCheck },
          ip,
          userAgent
        });
        // delete the uploaded file since we are blocking
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(403).json({ error: result.reason || 'Membership invalid' });
      }

      // Accept final PDF and advance status
      await appDb.query(
        `UPDATE submissions
            SET final_pdf_path=$2,
                final_submitted_at=NOW(),
                status='final_submitted',
                updated_at=NOW()
          WHERE id=$1`,
        [sid, req.file.path]
      );

      await logSecurityEvent({
        traceId,
        actorUserId: uid,
        action: 'final.upload_ok',
        entityType: 'submission',
        entityId: String(sid),
        severity: 'info',
        details: { file: path.basename(req.file.path), email: emailToCheck },
        ip,
        userAgent
      });

      return res.json({ ok: true, submission_id: sid });
    } catch (e) {
      // If multer accepted but something failed after, try to clean up file
      try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
      await logSecurityEvent({
        traceId: 'FINAL-UP-ERR',
        action: 'final.error',
        severity: 'error',
        details: { message: e.message }
      });
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

export default r;
