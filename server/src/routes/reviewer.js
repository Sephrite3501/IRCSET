// server/src/routes/reviewer.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { appDb } from '../db/pool.js';
import { cleanText } from '../utils/validators.js';

const r = Router();

// List assignments (kept for completeness)
r.get('/reviewer/assignments', requireAuth, requireRole('reviewer'), async (req, res) => {
  const q = await appDb.query(`
    SELECT s.id, s.title, s.category_id, s.status,
           a.assigned_at, a.due_at,
           r.status AS review_status, r.submitted_at
    FROM assignments a
    JOIN submissions s ON s.id=a.submission_id
    LEFT JOIN reviews r
      ON r.submission_id=a.submission_id AND r.reviewer_user_id=a.reviewer_user_id
    WHERE a.reviewer_user_id=$1
    ORDER BY a.assigned_at DESC
  `, [req.user.uid]);
  res.json({ items: q.rows });
});

// Submit review (UPDATE if exists; INSERT otherwise)
r.post('/reviewer/submissions/:id/reviews', requireAuth, requireRole('reviewer'), async (req, res) => {
  const sid = Number(req.params.id || 0);
  if (!sid) return res.status(400).json({ error: 'Bad id' });

  const score = Number(req.body?.score_overall);
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    return res.status(400).json({ error: 'Bad score' });
  }

  const cfa = cleanText(req.body?.comments_for_author, { max: 5000 });
  const cc  = cleanText(req.body?.comments_confidential, { max: 5000 });

  // Must be assigned
  const a = await appDb.query(
    `SELECT 1 FROM assignments WHERE submission_id=$1 AND reviewer_user_id=$2`,
    [sid, req.user.uid]
  );
  if (!a.rowCount) return res.status(403).json({ error: 'Not assigned' });

  try {
    await appDb.query('BEGIN');

    // Try UPDATE first
    const upd = await appDb.query(
      `UPDATE reviews
         SET score_overall=$3,
             comments_for_author=$4,
             comments_confidential=$5,
             status='submitted',
             submitted_at=NOW()
       WHERE submission_id=$1 AND reviewer_user_id=$2
       RETURNING id`,
      [sid, req.user.uid, score, cfa || null, cc || null]
    );

    // If no row existed (edge case), INSERT with UPSERT
    if (!upd.rowCount) {
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
        [sid, req.user.uid, score, cfa || null, cc || null]
      );
    }

    await appDb.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await appDb.query('ROLLBACK');
    return res.status(500).json({ error: 'Server error' });
  }
});

export default r;
