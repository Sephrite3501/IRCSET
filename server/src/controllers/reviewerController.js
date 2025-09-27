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

  // ----- ITP scoring: 4 subscores, each 1..5
  const sTech = Number(req.body?.score_technical);
  const sRel  = Number(req.body?.score_relevance);
  const sInn  = Number(req.body?.score_innovation);
  const sWri  = Number(req.body?.score_writing);

  const isScoreOk = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
  if (![sTech, sRel, sInn, sWri].every(isScoreOk)) {
    return res.status(400).json({ error: 'Scores must be integers 1..5 (technical, relevance, innovation, writing)' });
  }

  // overall = simple average of 4 subscores, 2 decimals
  const score_overall = Math.round(((sTech + sRel + sInn + sWri) / 4) * 100) / 100;

  const comments_for_author   = cleanText(req.body?.comments_for_author,   { max: 5000 }) || null;
  const comments_committee    = cleanText(req.body?.comments_committee,    { max: 5000 }) || null;

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
         (submission_id, reviewer_user_id,
          score_technical, score_relevance, score_innovation, score_writing,
          score_overall,
          comments_for_author, comments_committee,
          status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted', NOW())
       ON CONFLICT (submission_id, reviewer_user_id) DO UPDATE
         SET score_technical       = EXCLUDED.score_technical,
             score_relevance       = EXCLUDED.score_relevance,
             score_innovation      = EXCLUDED.score_innovation,
             score_writing         = EXCLUDED.score_writing,
             score_overall         = EXCLUDED.score_overall,
             comments_for_author   = EXCLUDED.comments_for_author,
             comments_committee    = EXCLUDED.comments_committee,
             status                = 'submitted',
             submitted_at          = NOW()`,
      [sid, uid, sTech, sRel, sInn, sWri, score_overall, comments_for_author, comments_committee]
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
      details: {
        scores: { technical: sTech, relevance: sRel, innovation: sInn, writing: sWri, overall: score_overall },
        cfa_len: comments_for_author?.length || 0,
        cc_len: comments_committee?.length || 0
      }
    }).catch(() => {});

    return res.json({ ok: true, score_overall });
  } catch (e) {
    await appDb.query('ROLLBACK');
    return res.status(500).json({ error: 'Server error' });
  }
}
