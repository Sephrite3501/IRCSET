import { appDb } from '../db/pool.js';
import { cleanText } from '../utils/validators.js';
import { decisionsMadeTotal } from '../utils/metrics.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

/** GET /chair/:eventId/decisions/queue */
export async function listQueue(req, res) {
  const eventId = Number(req.params.eventId || 0);
  if (!eventId) return res.status(400).json({ error: 'Event ID required' });

  const min = Math.max(1, parseInt(req.query.min ?? '1', 10));

  const q = await appDb.query(
    `
    WITH agg AS (
      SELECT submission_id,
             COUNT(*) FILTER (WHERE status='submitted') AS n_reviews,
             AVG(score_overall) FILTER (WHERE status='submitted') AS avg_score
      FROM reviews
      GROUP BY submission_id
    )
    SELECT
      s.id,
      s.title,
      s.status,
      s.created_at,
      COALESCE(agg.n_reviews, 0) AS n_reviews,
      COALESCE(agg.avg_score, 0)::float AS avg_score
    FROM submissions s
    LEFT JOIN agg ON agg.submission_id = s.id
    LEFT JOIN decisions d ON d.submission_id = s.id
    WHERE s.event_id=$1
      AND d.submission_id IS NULL
      AND s.status IN ('submitted','under_review')
      AND COALESCE(agg.n_reviews,0) >= $2
    ORDER BY s.created_at ASC
    `,
    [eventId, min]
  );

  res.json({ items: q.rows, event_id: eventId, minReviews: min });
}

/** GET /chair/:eventId/decisions/:submission_id */
export async function getDecisionDetail(req, res) {
  const sid = Number(req.params.submission_id || 0);
  if (!sid) return res.status(400).json({ error: 'Bad submission ID' });

  const s = await appDb.query(
    `SELECT id, title, abstract, keywords, status, event_id, created_at
     FROM submissions WHERE id=$1`,
    [sid]
  );
  const sub = s.rows[0];
  if (!sub) return res.status(404).json({ error: 'Not found' });
  if (sub.event_id !== Number(req.params.eventId)) {
    return res.status(403).json({ error: 'Submission not in this event' });
  }

  const reviews = await appDb.query(
    `SELECT reviewer_user_id, score_overall, status, submitted_at,
            comments_for_author, comments_confidential
     FROM reviews WHERE submission_id=$1 ORDER BY submitted_at DESC NULLS LAST`,
    [sid]
  );

  const dec = await appDb.query(
    `SELECT decision, reason, decided_at, decider_user_id
     FROM decisions WHERE submission_id=$1`,
    [sid]
  );

  const submitted = reviews.rows.filter(r => r.status === 'submitted');
  const avg_score = submitted.length
    ? submitted.reduce((a, b) => a + Number(b.score_overall || 0), 0) / submitted.length
    : 0;

  res.json({
    submission: sub,
    reviews: submitted,
    n_reviews: submitted.length,
    avg_score,
    decision: dec.rows[0] || null
  });
}

/** POST /chair/:eventId/decisions/:submission_id */
export async function makeDecision(req, res) {
  const traceId = `CHAIR-DEC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const sid = Number(req.params.submission_id || 0);
  const eventId = Number(req.params.eventId || 0);
  const decision = cleanText(String(req.body?.decision || ''), { max: 16 }).toLowerCase();
  const reason = cleanText(String(req.body?.reason || ''), { max: 2000 }) || null;
  const min = Math.max(1, parseInt(req.query.min ?? '1', 10));

  if (!sid || !['accept', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const s = await appDb.query(
    `SELECT id, event_id, status FROM submissions WHERE id=$1`,
    [sid]
  );
  const sub = s.rows[0];
  if (!sub) return res.status(404).json({ error: 'Submission not found' });
  if (sub.event_id !== eventId) {
    return res.status(403).json({ error: 'Submission not in this event' });
  }

  const rc = await appDb.query(
    `SELECT COUNT(*)::int AS n FROM reviews WHERE submission_id=$1 AND status='submitted'`,
    [sid]
  );
  if (rc.rows[0].n < min) {
    return res.status(409).json({ error: 'Insufficient submitted reviews', have: rc.rows[0].n, want: min });
  }

  const newStatus = decision === 'accept' ? 'final_required' : 'decision_made';

  try {
    await appDb.query('BEGIN');

    const ins = await appDb.query(
      `INSERT INTO decisions (submission_id, decider_user_id, event_id, decision, reason)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (submission_id) DO NOTHING
       RETURNING id, decision, reason, decided_at, decider_user_id`,
      [sid, req.user.uid, eventId, decision, reason]
    );

    if (!ins.rowCount) {
      await appDb.query('ROLLBACK');
      const d = await appDb.query(
        `SELECT decision, reason, decided_at, decider_user_id FROM decisions WHERE submission_id=$1`,
        [sid]
      );
      return res.status(409).json({ error: 'Already decided', decision: d.rows[0] });
    }

    await appDb.query(
      `UPDATE submissions SET status=$1, updated_at=NOW() WHERE id=$2`,
      [newStatus, sid]
    );

    await appDb.query('COMMIT');

    await logSecurityEvent({
      traceId,
      actorUserId: req.user.uid,
      action: 'chair.decision',
      severity: 'info',
      entity_type: 'submission',
      entity_id: String(sid),
      details: { event_id: eventId, decision, newStatus, reason_len: reason ? reason.length : 0 }
    });
    decisionsMadeTotal.labels(decision).inc();

    return res.json({ ok: true, decision: ins.rows[0], submission_status: newStatus });
  } catch (e) {
    await appDb.query('ROLLBACK');
    await logSecurityEvent({
      traceId, actorUserId: req.user.uid, action: 'chair.decision.error', severity: 'error',
      entity_type: 'submission', entity_id: String(sid), details: { message: e.message }
    });
    return res.status(500).json({ error: 'Server error' });
  }
}
