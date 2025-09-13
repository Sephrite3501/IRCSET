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
  const score = Number(req.body?.score || 0);
  const commentsAuthor = cleanText(req.body?.comments_for_author, { max: 2000 });
  const commentsConf = cleanText(req.body?.comments_confidential, { max: 2000 });

  if (!eventId || !submissionId || isNaN(score)) throw new ApiError(400, 'Invalid input');

  const ins = await appDb.query(
    `INSERT INTO reviews (submission_id, reviewer_user_id, score_overall, comments_for_author, comments_confidential, status, submitted_at)
     VALUES ($1,$2,$3,$4,$5,'submitted',NOW())
     ON CONFLICT (submission_id, reviewer_user_id)
     DO UPDATE SET score_overall=$3,
                   comments_for_author=$4,
                   comments_confidential=$5,
                   status='submitted',
                   submitted_at=NOW()
     RETURNING id, submission_id, score_overall, status, submitted_at`,
    [submissionId, req.user.uid, score, commentsAuthor, commentsConf]
  );
  const review = ins.rows[0];

  await logSecurityEvent({
    traceId,
    actorUserId: req.user.uid,
    action: 'review.submit',
    severity: 'info',
    details: { event_id: eventId, submission_id: submissionId, score },
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
