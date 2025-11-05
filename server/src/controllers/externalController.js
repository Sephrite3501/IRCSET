import { appDb } from '../db/pool.js';
import { ApiError } from '../lib/ApiError.js';
import { cleanText } from '../utils/validators.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';
import { sendExternalReviewInvite } from '../services/emailService.js';



export async function getExternalReviewPage(req, res) {
  const { token } = req.params;

  try {
    // 1. Find external reviewer
    const reviewerRes = await appDb.query(
      `SELECT * FROM external_reviewers WHERE invite_token = $1 AND expires_at > NOW()`,
      [token]
    );
    if (!reviewerRes.rowCount) {
      return res.status(404).json({ error: "Invalid or expired review link" });
    }
    const reviewer = reviewerRes.rows[0];

    // 2. Fetch submission assigned to this external reviewer
    const submissionsRes = await appDb.query(
      `
      SELECT s.id, s.title, s.abstract, s.keywords, s.pdf_path, s.status, 
             s.event_id, e.name AS event_name, s.authors
      FROM assignments a
      JOIN submissions s ON a.submission_id = s.id
      JOIN events e ON e.id = s.event_id
      WHERE a.external_reviewer_id = $1
      `,
      [reviewer.id]
    );

    if (!submissionsRes.rowCount) {
      return res.status(404).json({ error: "No submission found for reviewer" });
    }

    const submission = submissionsRes.rows[0];

    return res.json({
      reviewer: {
        id: reviewer.id,
        name: reviewer.name,
        email: reviewer.email,
      },
      submission,
    });
  } catch (err) {
    console.error("Error loading external review page:", err);
    res.status(500).json({ error: "Database error" });
  }
}


export async function submitExternalReview(req, res) {
  const { token } = req.params;
  const {
    score_technical,
    score_relevance,
    score_innovation,
    score_writing,
    comments_for_author,
    comments_committee,
  } = req.body;

  try {
    // 1️⃣ Validate reviewer token
    const reviewerRes = await appDb.query(
      `SELECT * FROM external_reviewers WHERE invite_token = $1 AND expires_at > NOW()`,
      [token]
    );

    if (!reviewerRes.rowCount) {
      return res.status(400).json({ error: "Invalid or expired review link" });
    }

    const reviewer = reviewerRes.rows[0];

    // 2️⃣ Find assigned submission
    const assignmentRes = await appDb.query(
      `SELECT submission_id FROM assignments WHERE external_reviewer_id = $1`,
      [reviewer.id]
    );

    if (!assignmentRes.rowCount) {
      return res.status(400).json({ error: "No submission assigned to this reviewer" });
    }

    const submissionId = assignmentRes.rows[0].submission_id;

    // 3️⃣ Compute overall average score
    const overall =
      (score_technical + score_relevance + score_innovation + score_writing) / 4;

    // 4️⃣ Insert or update review
    await appDb.query(`
    INSERT INTO reviews (
        submission_id, external_reviewer_id,
        score_technical, score_relevance, score_innovation, score_writing,
        comments_for_author, comments_committee, score_overall, status, submitted_at, review_submitted
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted', NOW(), TRUE)
    ON CONFLICT (submission_id, external_reviewer_id)
    DO UPDATE SET
        score_technical = EXCLUDED.score_technical,
        score_relevance = EXCLUDED.score_relevance,
        score_innovation = EXCLUDED.score_innovation,
        score_writing = EXCLUDED.score_writing,
        comments_for_author = EXCLUDED.comments_for_author,
        comments_committee = EXCLUDED.comments_committee,
        score_overall = EXCLUDED.score_overall,
        status = 'submitted',
        review_submitted = TRUE,
        submitted_at = NOW()
    `, [
    submissionId,
    reviewer.id,
    score_technical,
    score_relevance,
    score_innovation,
    score_writing,
    comments_for_author,
    comments_committee,
    overall
    ]);

    // 5️⃣ Mark assignment as reviewed
    //await appDb.query(
    //  `UPDATE assignments SET review_status = 'submitted' WHERE submission_id = $1 AND external_reviewer_id = $2`,
    //  [submissionId, reviewer.id]
    //);

    // 6️⃣ Respond success
    res.json({ ok: true, message: "External review submitted successfully." });
  } catch (err) {
    console.error("Error submitting external review:", err);
    res.status(500).json({ error: "Database error while submitting review" });
  }
}

export async function getExternalReviewsForSubmission(req, res) {
  const { eventId, subId } = req.params;
  console.log("🔍 [DEBUG] getExternalReviewsForSubmission called", { eventId, subId });

  const query = `
    SELECT
      r.id AS review_id,
      r.submission_id,
      r.external_reviewer_id,
      er.name AS reviewer_name,
      er.email AS reviewer_email,
      TRUE AS is_external,
      r.score_technical,
      r.score_relevance,
      r.score_innovation,
      r.score_writing,
      r.score_overall,
      r.comments_for_author,
      r.comments_committee,
      r.submitted_at
    FROM reviews r
    JOIN external_reviewers er ON er.id = r.external_reviewer_id
    JOIN assignments a ON a.external_reviewer_id = er.id AND a.submission_id = r.submission_id
    WHERE r.submission_id = $1
      AND a.event_id = $2
      AND r.external_reviewer_id IS NOT NULL
    ORDER BY r.submitted_at DESC;
  `;

  try {
    const { rows } = await appDb.query(query, [subId, eventId]);
    console.log("✅ [DEBUG] External reviews rows:", rows.length);
    res.json({ items: rows });
  } catch (err) {
    console.error("❌ [ERROR] External reviews query failed:", err);
    res.status(500).json({ error: "Failed to load external reviews" });
  }
}
