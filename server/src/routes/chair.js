// server/src/routes/chair.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { appDb } from '../db/pool.js';

const r = Router();

/**
 * GET /chair/submissions
 * Global chair sees ALL submissions, newest first
 */
r.get('/chair/submissions', requireAuth, requireRole('chair'), async (req, res) => {
  const q = await appDb.query(
    `SELECT s.id, s.title, s.category_id, s.status, s.created_at,
            COALESCE(d.decision, '') AS decision
       FROM submissions s
       LEFT JOIN decisions d ON d.submission_id = s.id
      ORDER BY s.created_at DESC`
  );
  res.json({ items: q.rows });
});

/**
 * POST /chair/submissions/:id/assign
 * body: { reviewers: [userId, ...], due_at?: ISO8601 }
 * Rules:
 *  - Reviewer must exist and have user_categories entry matching submission.category_id
 *  - On first assignment for this submission, set status -> 'under_review'
 */
r.post('/chair/submissions/:id/assign', requireAuth, requireRole('chair'), async (req, res) => {
  const submissionId = Number(req.params.id || 0);
  const reviewers = Array.isArray(req.body?.reviewers) ? req.body.reviewers.map(Number) : [];
  const dueAt = req.body?.due_at ? new Date(req.body.due_at) : null;

  if (!submissionId || reviewers.length === 0) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // fetch submission (for category)
  const s = await appDb.query('SELECT id, category_id, status FROM submissions WHERE id=$1', [submissionId]);
  const sub = s.rows[0];
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  // filter reviewers by category scope
  const vr = await appDb.query(
    `SELECT uc.user_id
       FROM user_categories uc
       JOIN users u ON u.id = uc.user_id
      WHERE uc.category_id=$1 AND uc.role_scope='reviewer' AND uc.user_id = ANY($2::int[])`,
    [sub.category_id, reviewers]
  );
  const allowedSet = new Set(vr.rows.map(r => r.user_id));
  const accepted = reviewers.filter(id => allowedSet.has(id));
  const rejected = reviewers.filter(id => !allowedSet.has(id));

  // insert assignments for accepted reviewers
  for (const rid of accepted) {
    await appDb.query(
      `INSERT INTO assignments (submission_id, reviewer_user_id, assigned_by_user_id, due_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [submissionId, rid, req.user.uid || null, dueAt || null]
    );

    // ensure a review row exists with status 'assigned'
    await appDb.query(
      `INSERT INTO reviews (submission_id, reviewer_user_id, status)
       VALUES ($1,$2,'assigned')
       ON CONFLICT DO NOTHING`,
      [submissionId, rid]
    );
  }

  // if first assignment for this submission, move to under_review
  const count = await appDb.query('SELECT COUNT(*)::int AS n FROM assignments WHERE submission_id=$1', [submissionId]);
  if (count.rows[0].n > 0 && sub.status === 'submitted') {
    await appDb.query(`UPDATE submissions SET status='under_review', updated_at=NOW() WHERE id=$1`, [submissionId]);
  }

  res.json({ ok: true, accepted, rejected });
});

export default r;
