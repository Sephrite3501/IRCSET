import { appDb } from '../db/pool.js';
import { ApiError } from '../lib/ApiError.js';
import { cleanText } from '../utils/validators.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

// User registers for an event (becomes author)
export async function registerForEvent(req, res) {
  const traceId = `EVT-REG-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const eventId = Number(req.params.eventId || 0);
  if (!eventId) throw new ApiError(400, 'Event ID required');

  const ins = await appDb.query(
    `INSERT INTO event_roles (event_id, user_id, role)
     VALUES ($1,$2,'author')
     ON CONFLICT (event_id, user_id, role) DO NOTHING
     RETURNING id, event_id, user_id, role`,
    [eventId, req.user.uid]
  );

  if (!ins.rowCount) throw new ApiError(400, 'Already registered');

  await logSecurityEvent({
    traceId,
    actorUserId: req.user.uid,
    action: 'event.register',
    severity: 'info',
    details: { event_id: eventId },
    ip,
    userAgent
  });

  res.json({ ok: true, role: ins.rows[0] });
}

// Chair assigns reviewer
export async function assignReviewer(req, res) {
  const traceId = `EVT-ASSIGN-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const eventId = Number(req.params.eventId || 0);
  const submissionId = Number(req.params.submissionId || 0);
  const reviewerId = Number(req.body?.reviewer_id || 0);
  if (!eventId || !submissionId || !reviewerId) throw new ApiError(400, 'Invalid input');

  // Ensure reviewer belongs to this event
  const chk = await appDb.query(
    `SELECT 1
       FROM event_roles er
       JOIN submissions s ON s.event_id = er.event_id
      WHERE s.id=$1 AND er.user_id=$2 AND er.role='reviewer' AND s.event_id=$3`,
    [submissionId, reviewerId, eventId]
  );
  if (!chk.rowCount) throw new ApiError(400, 'Reviewer not in this event');

  const ins = await appDb.query(
    `INSERT INTO assignments (submission_id, reviewer_user_id, assigned_by_user_id)
     VALUES ($1,$2,$3)
     ON CONFLICT DO NOTHING
     RETURNING id, submission_id, reviewer_user_id`,
    [submissionId, reviewerId, req.user.uid]
  );
  if (!ins.rowCount) throw new ApiError(400, 'Already assigned');

  await logSecurityEvent({
    traceId,
    actorUserId: req.user.uid,
    action: 'assignment.create',
    severity: 'info',
    details: { event_id: eventId, submission_id: submissionId, reviewer_id: reviewerId },
    ip,
    userAgent
  });

  res.json({ ok: true, assignment: ins.rows[0] });
}

// Reviewer submits review
export async function submitReview(req, res) {
  const traceId = `EVT-REV-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const eventId = Number(req.params.eventId || 0);
  const submissionId = Number(req.params.submissionId || 0);
  if (!eventId || !submissionId) throw new ApiError(400, 'Invalid input');

  // 1..5 subscores
  const sTech = Number(req.body?.score_technical);
  const sRel  = Number(req.body?.score_relevance);
  const sInn  = Number(req.body?.score_innovation);
  const sWri  = Number(req.body?.score_writing);
  const ok = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
  if (![sTech, sRel, sInn, sWri].every(ok)) {
    throw new ApiError(400, 'Scores must be integers 1..5 (technical, relevance, innovation, writing)');
  }
  const score_overall = Math.round(((sTech + sRel + sInn + sWri) / 4) * 100) / 100;

  const comments_for_author = cleanText(req.body?.comments_for_author, { max: 5000 }) || null;
  const comments_committee  = cleanText(req.body?.comments_committee,  { max: 5000 }) || null;

  // Ensure reviewer is assigned to this submission within the event
  const chk = await appDb.query(
    `SELECT 1
       FROM assignments a
       JOIN submissions s ON s.id = a.submission_id
      WHERE a.submission_id=$1
        AND a.reviewer_user_id=$2
        AND s.event_id=$3`,
    [submissionId, req.user.uid, eventId]
  );
  if (!chk.rowCount) throw new ApiError(403, 'Not assigned');

  const ins = await appDb.query(
    `INSERT INTO reviews
       (submission_id, reviewer_user_id,
        score_technical, score_relevance, score_innovation, score_writing,
        score_overall, comments_for_author, comments_committee,
        status, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted', NOW())
     ON CONFLICT (submission_id, reviewer_user_id)
     DO UPDATE SET
        score_technical     = EXCLUDED.score_technical,
        score_relevance     = EXCLUDED.score_relevance,
        score_innovation    = EXCLUDED.score_innovation,
        score_writing       = EXCLUDED.score_writing,
        score_overall       = EXCLUDED.score_overall,
        comments_for_author = EXCLUDED.comments_for_author,
        comments_committee  = EXCLUDED.comments_committee,
        status              = 'submitted',
        submitted_at        = NOW()
     RETURNING id, submission_id, score_overall, status, submitted_at`,
    [submissionId, req.user.uid, sTech, sRel, sInn, sWri, score_overall, comments_for_author, comments_committee]
  );
  const review = ins.rows[0];

  await logSecurityEvent({
    traceId,
    actorUserId: req.user.uid,
    action: 'review.submit',
    severity: 'info',
    details: {
      event_id: eventId,
      submission_id: submissionId,
      scores: { technical: sTech, relevance: sRel, innovation: sInn, writing: sWri, overall: score_overall }
    },
    ip,
    userAgent
  });

  res.json({ ok: true, review });
}

// Chair makes decision
export async function makeDecision(req, res) {
  const traceId = `EVT-DEC-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const eventId = Number(req.params.eventId || 0);
  const submissionId = Number(req.params.submissionId || 0);
  const decision = cleanText(req.body?.decision, { max: 10 }).toLowerCase();
  const reason = cleanText(req.body?.reason, { max: 2000 });

  if (!eventId || !submissionId || !['accept', 'reject'].includes(decision)) {
    throw new ApiError(400, 'Invalid input');
  }

  const newStatus = decision === 'accept' ? 'final_required' : 'decision_made';

  const ins = await appDb.query(
    `INSERT INTO decisions (submission_id, decider_user_id, decision, reason)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (submission_id)
     DO UPDATE SET decider_user_id=$2,
                   decision=$3,
                   reason=$4,
                   decided_at=NOW()
     RETURNING id, submission_id, decision, reason, decided_at`,
    [submissionId, req.user.uid, decision, reason]
  );
  const dec = ins.rows[0];

  await appDb.query(
    `UPDATE submissions
        SET status=$1,
            updated_at=NOW()
      WHERE id=$2 AND event_id=$3`,
    [newStatus, submissionId, eventId]
  );

  await logSecurityEvent({
    traceId,
    actorUserId: req.user.uid,
    action: 'decision.make',
    severity: 'info',
    details: { event_id: eventId, submission_id: submissionId, decision, newStatus },
    ip,
    userAgent
  });

  res.json({ ok: true, decision: dec, submission_status: newStatus });
}

export async function getAllEvents(req, res) {
  try {
    const { rows } = await appDb.query(
      "SELECT id, name, description, start_date, end_date FROM events ORDER BY start_date DESC;"
    );
    res.json({ items: rows });
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: "Failed to load events" });
  }
}
