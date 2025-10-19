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

export async function listReviewerEvents(req, res) {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const q = await appDb.query(
      `SELECT e.id, e.name, e.description, e.start_date, e.end_date
         FROM events e
         JOIN event_roles r ON e.id = r.event_id
        WHERE r.user_id = $1 AND r.role = 'reviewer'
        ORDER BY e.start_date DESC`,
      [uid]
    );
    return res.json({ items: q.rows });
  } catch (e) {
    console.error('Error fetching reviewer events:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function submitReview(req, res) {
  const traceId = `REV-SUB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const uid = req.user?.uid;
   const sid = Number(req.params.paperId || 0);
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
          status, review_submitted, submitted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted',TRUE,NOW())
      ON CONFLICT (submission_id, reviewer_user_id) DO UPDATE
        SET score_technical     = EXCLUDED.score_technical,
            score_relevance     = EXCLUDED.score_relevance,
            score_innovation    = EXCLUDED.score_innovation,
            score_writing       = EXCLUDED.score_writing,
            score_overall       = EXCLUDED.score_overall,
            comments_for_author = EXCLUDED.comments_for_author,
            comments_committee  = EXCLUDED.comments_committee,
            status              = 'submitted',
            review_submitted    = TRUE,
            submitted_at        = NOW()`,
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


export async function getPaperDetails(req, res) {
  const uid = req.user?.uid;
  const eventId = Number(req.params.eventId);
  const paperId = Number(req.params.paperId);

  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  if (!eventId || !paperId) return res.status(400).json({ error: 'Invalid params' });

  try {
    // Ensure reviewer is assigned to this paper
    const assigned = await appDb.query(
      `SELECT 1
         FROM assignments a
         JOIN submissions s ON s.id = a.submission_id
        WHERE a.reviewer_user_id = $1
          AND a.submission_id = $2
          AND s.event_id = $3`,
      [uid, paperId, eventId]
    );
    if (!assigned.rowCount) return res.status(403).json({ error: 'Not assigned to this paper' });

    // 🔹 Updated query with JOIN to include event name
    const q = await appDb.query(
      `SELECT s.id, s.title, s.abstract, s.keywords, s.pdf_path, s.status,
              s.authors, e.name AS event_name
         FROM submissions s
         JOIN events e ON e.id = s.event_id
        WHERE s.id = $1 AND s.event_id = $2`,
      [paperId, eventId]
    );

    if (!q.rows.length) return res.status(404).json({ error: 'Paper not found' });

    const paper = q.rows[0];

    // Generate clean URL for PDF
    paper.pdf_url = `${req.protocol}://${req.get('host')}/${paper.pdf_path.replace(/\\/g, '/')}`;

    return res.json({ submission: paper });
  } catch (err) {
    console.error('Error fetching paper details', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export async function getPaperReviewDetails(req, res) {
  const uid = req.user?.uid;
    const eventId = Number(req.params.eventId || 0);
    const paperId = Number(req.params.paperId || 0);

    console.log("🧩 [getPaperDetails] START", { uid, eventId, paperId });

    if (!eventId || !paperId) {
      console.warn("⚠️ Invalid event/paper IDs");
      return res.status(400).json({ error: "Bad IDs" });
    }

    try {
      // Check reviewer assignment
      const assigned = await appDb.query(
        `SELECT 1
          FROM assignments a
          JOIN submissions s ON s.id = a.submission_id
          WHERE a.submission_id=$1 AND a.reviewer_user_id=$2 AND s.event_id=$3`,
        [paperId, uid, eventId]
      );
      console.log("📋 Assignment check:", assigned.rowCount);

      if (!assigned.rowCount) {
        console.warn("🚫 Reviewer not assigned to this paper");
        return res.status(403).json({ error: "Not assigned to this paper" });
      }

      // Fetch paper info
      const sub = await appDb.query(
        `SELECT s.id, s.title, s.abstract, s.keywords, s.pdf_path, s.status, e.name AS event_name
          FROM submissions s
          JOIN events e ON e.id = s.event_id
          WHERE s.id=$1 AND s.event_id=$2`,
        [paperId, eventId]
      );
      console.log("📄 Submission rows:", sub.rows);

      if (!sub.rowCount) {
        console.warn("❌ Paper not found in event");
        return res.status(404).json({ error: "Paper not found" });
      }

      // Fetch review by this reviewer
      const review = await appDb.query(
        `SELECT score_technical, score_relevance, score_innovation, score_writing,
                score_overall, comments_for_author, comments_committee, status
          FROM reviews
          WHERE submission_id=$1 AND reviewer_user_id=$2
          LIMIT 1`,
        [paperId, uid]
      );
      console.log("🧠 Review found:", review.rows);

      return res.json({
        submission: {
          ...sub.rows[0],
          review_status: review.rows[0]?.status || null,
          existing_review: review.rows[0] || null
        }
      });
    } catch (err) {
      console.error("💥 getPaperDetails error:", err);
      return res.status(500).json({ error: "Internal server error", details: err.message });
    }
}