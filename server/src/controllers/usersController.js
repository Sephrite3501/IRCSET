// server/src/controllers/usersController.js
import { appDb } from "../db/pool.js";


export async function getMySubmissions(req, res) {
  const uid = req.user.id || req.user.uid;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  try {
    const q = await appDb.query(
      `SELECT 
         e.id AS event_id,
         e.name AS event_name,
         s.id AS submission_id,
         s.title,
         s.abstract,
         s.keywords,
         s.status AS submission_status,
         s.final_pdf_path,         
         r.id AS review_id,
         r.reviewer_user_id,
         u.name AS reviewer_name,
         r.score_technical,
         r.score_relevance,
         r.score_innovation,
         r.score_writing,
         r.score_overall,
         r.comments_for_author,
         r.comments_committee,
         r.status AS review_status,
         (r.status = 'submitted') AS review_submitted
       FROM submissions s
       JOIN events e ON e.id = s.event_id
       LEFT JOIN reviews r ON r.submission_id = s.id
       LEFT JOIN users u ON u.id = r.reviewer_user_id
       WHERE s.author_user_id = $1
       ORDER BY e.name, s.id, r.id;`,
      [uid]
    );

    // Group by event → submission → reviews
    const events = {};
    for (const row of q.rows) {
      if (!events[row.event_id]) {
        events[row.event_id] = {
          event_id: row.event_id,
          event_name: row.event_name,
          papers: {},
        };
      }

      if (!events[row.event_id].papers[row.submission_id]) {
        events[row.event_id].papers[row.submission_id] = {
          submission_id: row.submission_id,
          event_id: row.event_id,            
          title: row.title,
          abstract: row.abstract,
          keywords: row.keywords,
          status: row.submission_status,
          final_pdf_path: row.final_pdf_path,  
          reviews: [],
        };
      }

      if (row.review_id) {
        events[row.event_id].papers[row.submission_id].reviews.push({
          // ✅ For authors, mask reviewer identity
          reviewer_name:
            row.review_submitted && row.comments_for_author
              ? "Anonymous Reviewer"
              : null,
          score_technical: row.score_technical,
          score_relevance: row.score_relevance,
          score_innovation: row.score_innovation,
          score_writing: row.score_writing,
          score_overall: row.score_overall,
          comments_for_author: row.comments_for_author,
          comments_committee: row.comments_committee,
          review_status: row.review_status,
          review_submitted: row.review_submitted,
        });
      }
    }

    // Flatten structure
    const result = Object.values(events).map((ev) => ({
      ...ev,
      papers: Object.values(ev.papers),
    }));

    res.json({ events: result });
  } catch (e) {
    console.error("getMySubmissions error:", e);
    res.status(500).json({ error: "Server error" });
  }
}
