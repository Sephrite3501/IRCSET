// server/src/controllers/finalController.js
import path from 'path';
import fs from 'fs';
import { appDb } from '../db/pool.js';
import { checkMembershipByEmail } from '../services/membershipCheck.js';
import { finalUploadsTotal } from '../utils/metrics.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

// Toggle membership gate via env (set MEMBERSHIP_ENFORCE=false to bypass check but still log)
const MEMBERSHIP_ENFORCE = (process.env.MEMBERSHIP_ENFORCE ?? 'true') !== 'false';

export async function uploadFinal(req, res) {
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

    const isOwner = sub.author_user_id === uid;
    const isAdmin = req.user?.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

    if (sub.status !== 'final_required') {
      return res.status(409).json({ error: `Invalid status ${sub.status}; final upload not allowed` });
    }

    // Determine which email to validate
    let emailToCheck = sub.irc_member_email_optional || null;
    if (!emailToCheck) {
      const uq = await appDb.query('SELECT email FROM users WHERE id=$1', [uid]);
      emailToCheck = uq.rows[0]?.email || null;
    }

    // Membership check (optional enforcement)
    let result = { ok: true, reason: 'unconfigured', meta: {} };
    if (MEMBERSHIP_ENFORCE) {
      result = await checkMembershipByEmail(emailToCheck);
    }

    // Audit the check
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
        entity_type: 'submission',
        entity_id: String(sid),
        severity: 'warn',
        details: { reason: result.reason || 'invalid', email: emailToCheck },
        ip,
        userAgent
      });
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(403).json({ error: result.reason || 'Membership invalid' });
    }

    // Store a relative path for portability
    const relPath = path.relative(process.cwd(), req.file.path);

    // Accept final PDF and advance status
    await appDb.query(
      `UPDATE submissions
          SET final_pdf_path=$2,
              final_submitted_at=NOW(),
              status='final_submitted',
              updated_at=NOW()
        WHERE id=$1`,
      [sid, relPath]
    );

    await logSecurityEvent({
      traceId,
      actorUserId: uid,
      action: 'final.upload_ok',
      entity_type: 'submission',
      entity_id: String(sid),
      severity: 'info',
      details: { file: path.basename(req.file.path), email: emailToCheck },
      ip,
      userAgent
    });

    finalUploadsTotal.inc();
    return res.json({ ok: true, submission_id: sid, status: 'final_submitted', final_pdf_path: relPath });
  } catch (e) {
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
