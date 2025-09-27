// server/src/controllers/reviewsReadController.js
import { appDb } from '../db/pool.js';
import { ApiError } from '../lib/ApiError.js';

// Chair: see ALL reviews (includes committee comments and reviewer identity)
export async function listReviewsForChair(req, res) {
  const eventId = Number(req.params.eventId || 0);
  const submissionId = Number(req.params.id || 0);
  if (!eventId || !submissionId) throw new ApiError(400, 'Bad ids');

  const q = await appDb.query(
    `
    SELECT r.id, r.submission_id, r.reviewer_user_id,
           u.name AS reviewer_name, u.email AS reviewer_email,
           r.score_technical, r.score_relevance, r.score_innovation, r.score_writing,
           r.score_overall,
           r.comments_for_author,
           r.comments_committee,
           r.status, r.submitted_at
    FROM reviews r
    JOIN submissions s ON s.id = r.submission_id
    JOIN users u ON u.id = r.reviewer_user_id
    WHERE r.submission_id = $1 AND s.event_id = $2
    ORDER BY r.submitted_at DESC NULLS LAST, r.id DESC
    `,
    [submissionId, eventId]
  );
  res.json({ items: q.rows });
}

// Author: see reviews on OWN submission (hide committee comments, hide reviewer identity)
export async function listReviewsForAuthor(req, res) {
  const eventId = Number(req.params.eventId || 0);
  const submissionId = Number(req.params.id || 0);
  const uid = req.user?.uid;
  if (!eventId || !submissionId) throw new ApiError(400, 'Bad ids');

  // Verify ownership & event match
  const s = await appDb.query(
    `SELECT 1 FROM submissions WHERE id=$1 AND event_id=$2 AND author_user_id=$3`,
    [submissionId, eventId, uid]
  );
  if (!s.rowCount) throw new ApiError(403, 'Forbidden');

  const q = await appDb.query(
    `
    SELECT r.id,
           r.score_technical, r.score_relevance, r.score_innovation, r.score_writing,
           r.score_overall,
           r.comments_for_author,
           r.status, r.submitted_at
    FROM reviews r
    WHERE r.submission_id = $1
    ORDER BY r.submitted_at DESC NULLS LAST, r.id DESC
    `,
    [submissionId]
  );
  res.json({ items: q.rows });
}
