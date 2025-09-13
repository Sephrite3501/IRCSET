// server/src/controllers/reviewerController.js
import { appDb } from '../db/pool.js';
import { cleanText } from '../utils/validators.js';
import { reviewsSubmittedTotal } from '../utils/metrics.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

export async function listAssignments(req, res) {
  const uid = req.user?.uid;
  const eventId = Number(req.params.eventId || 0);
  if (!eventId) return res.status(400).json({ error: 'Bad event id' });

  const q = await appDb.query(
    `
    SELECT s.id, s.title, s.status, s.event_id,
           a.assigned_at, a.due_at,
           r.status AS review_status, r.submitted_at
    FROM assignments a
    JOIN submissions s ON s.id = a.submission_id
    LEFT JOIN reviews r
      ON r.submission_id = a.submission_id AND r.reviewer_user_id = a.reviewer_user_id
    WHERE a.reviewer_user_id=$1
      AND s.event_id=$2
    ORDER BY a.assigned_at DESC
    `,
    [uid, eventId]
  );
  res.json({ items: q.rows });
}

export async function submitReview(req, res) {
  const traceId = `REV-SUB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const uid = req.user?.uid;
  const sid = Number(req.params.id || 0);
  const eventId = Number(req.params.eventId || 0);

  if (!sid || !eventId) return res.status(400).json({ error: 'Bad id' });

  const score = Number(req.body?.score_overall);
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    return res.status(400).json({ error: 'Bad score' });
  }

  const comments_for_author   = cleanText(req.body?.comments_for_author, { max: 5000 }) || null;
  const comments_confidential = cleanText(req.body?.comments_confidential, { max: 5000 }) || null;

  // Ensure submission belongs to event + user is assigned
  const a = await appDb.query(
    `SELECT 1
       FROM assignments a
       JOIN submissions s ON s.id = a.submission_id
      WHERE a.submission_id=$1 AND a.reviewer_user_id=$2 AND s.event_id=$3`,
    [sid, uid, eventId]
  );
  if (!a.rowCount) return res.status(403).json({ error: 'Not assigned' });

  try {
    await appDb.query('BEGIN');

    await appDb.query(
      `INSERT INTO reviews
         (submission_id, reviewer_user_id, score_overall, comments_for_author, comments_confidential, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,'submitted', NOW())
       ON CONFLICT (submission_id, reviewer_user_id) DO UPDATE
         SET score_overall=EXCLUDED.score_overall,
             comments_for_author=EXCLUDED.comments_for_author,
             comments_confidential=EXCLUDED.comments_confidential,
             status='submitted',
             submitted_at=NOW()`,
      [sid, uid, score, comments_for_author, comments_confidential]
    );

    await appDb.query('COMMIT');
    reviewsSubmittedTotal.inc();

    logSecurityEvent({
      traceId,
      actorUserId: uid,
      action: 'review.submit',
      severity: 'info',
      entity_type: 'submission',
      entity_id: String(sid),
      details: { score, cfa_len: comments_for_author?.length || 0, cc_len: comments_confidential?.length || 0 }
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (e) {
    await appDb.query('ROLLBACK');
    return res.status(500).json({ error: 'Server error' });
  }
}
