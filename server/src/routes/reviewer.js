// server/src/routes/reviewer.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { appDb } from '../db/pool.js';
import { cleanText } from '../utils/validators.js';

const r = Router();

/**
 * GET /reviewer/assignments
 * List assigned submissions (blinded fields only)
 */
r.get('/reviewer/assignments', requireAuth, requireRole('reviewer'), async (req, res) => {
  const uid = req.user.uid;

  const q = await appDb.query(
    `SELECT s.id, s.title, s.category_id, s.status,
            a.assigned_at, a.due_at,
            r.status AS review_status, r.submitted_at
       FROM assignments a
       JOIN submissions s ON s.id = a.submission_id
       LEFT JOIN reviews r ON r.submission_id = s.id AND r.reviewer_user_id = a.reviewer_user_id
      WHERE a.reviewer_user_id=$1
      ORDER BY a.assigned_at DESC`,
    [uid]
  );

  res.json({ items: q.rows });
});

/**
 * POST /reviewer/submissions/:id/reviews
 * body: { score_overall: number(0..10), comments_for_author: text, comments_confidential: text }
 * Requires that the requester is assigned as reviewer for this submission
 */
r.post('/reviewer/submissions/:id/reviews', requireAuth, requireRole('reviewer'), async (req, res) => {
  const uid = req.user.uid;
  const submissionId = Number(req.params.id || 0);
  if (!submissionId) return res.status(400).json({ error: 'Bad id' });

  // ensure assignment exists
  const a = await appDb.query(
    `SELECT 1 FROM assignments WHERE submission_id=$1 AND reviewer_user_id=$2`,
    [submissionId, uid]
  );
  if (!a.rowCount) return res.status(403).json({ error: 'Not assigned' });

  // validate input
  const score = Number(req.body?.score_overall);
  const cAuthor = cleanText(req.body?.comments_for_author, { max: 5000 });
  const cConf = cleanText(req.body?.comments_confidential, { max: 5000 });
  if (!(score >= 0 && score <= 10)) return res.status(400).json({ error: 'Score 0..10' });

  // upsert review row
  await appDb.query(
    `INSERT INTO reviews (submission_id, reviewer_user_id, score_overall, comments_for_author, comments_confidential, status, submitted_at)
     VALUES ($1,$2,$3,$4,$5,'submitted', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [submissionId, uid, score, cAuthor, cConf]
  );

  // If a row already exists (status 'assigned'), update it:
  await appDb.query(
    `UPDATE reviews
        SET score_overall=$3,
            comments_for_author=$4,
            comments_confidential=$5,
            status='submitted',
            submitted_at=NOW()
      WHERE submission_id=$1 AND reviewer_user_id=$2`,
    [submissionId, uid, score, cAuthor, cConf]
  );

  res.json({ ok: true });
});

export default r;
