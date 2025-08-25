// server/src/routes/chair.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { appDb } from '../db/pool.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

const r = Router();

// allow chair OR admin
function requireChair(req, res, next) {
  const role = req.user?.role;
  if (!role) return res.status(401).json({ error: 'Unauthorized' });
  if (role === 'chair' || role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

/**
 * GET /chair/submissions
 * Query: ?status=&category=&q=&page=1&limit=50
 * Returns aggregates to guide assignment.
 */
r.get('/chair/submissions', requireAuth, requireChair, async (req, res) => {
  const status = (req.query.status || '').trim();
  const category = (req.query.category || '').trim();
  const q = (req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset = (page - 1) * limit;

  const params = [];
  const where = ['1=1'];

  if (status) { params.push(status); where.push(`s.status = $${params.length}`); }
  if (category) { params.push(category); where.push(`s.category_id = $${params.length}`); }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`LOWER(s.title) LIKE $${params.length}`);
  }

  const sql = `
    WITH agg AS (
      SELECT
        s.id,
        COUNT(a.id)::int AS n_assigned,
        COUNT(*) FILTER (WHERE r.status='submitted')::int AS n_submitted,
        AVG(r.score_overall) FILTER (WHERE r.status='submitted')::float AS avg_score
      FROM submissions s
      LEFT JOIN assignments a ON a.submission_id = s.id
      LEFT JOIN reviews r ON r.submission_id = s.id
      GROUP BY s.id
    )
    SELECT
      s.id, s.title, s.category_id, s.status, s.created_at,
      COALESCE(d.decision, '') AS decision,
      COALESCE(agg.n_assigned, 0) AS n_assigned,
      COALESCE(agg.n_submitted, 0) AS n_submitted,
      COALESCE(agg.avg_score, 0)::float AS avg_score
    FROM submissions s
    LEFT JOIN decisions d ON d.submission_id = s.id
    LEFT JOIN agg ON agg.id = s.id
    WHERE ${where.join(' AND ')}
    ORDER BY s.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rows = await appDb.query(sql, params);
  res.json({ items: rows.rows, page, limit });
});

/**
 * POST /chair/submissions/:id/assign
 * body: { reviewers: [userId,...], due_at?: ISO8601 }
 * Rules:
 *  - Reviewer must exist, active, and be scoped as reviewer for submission.category_id
 *  - Cannot assign submission author
 *  - Cannot assign if a decision already exists (unless ?force=1)
 *  - First assignment moves status submitted -> under_review
 *  - Idempotent (requires unique DB constraints; see migration below)
 */
r.post('/chair/submissions/:id/assign', requireAuth, requireChair, async (req, res) => {
  const traceId = `CHAIR-ASN-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const submissionId = Number(req.params.id || 0);
  const raw = Array.isArray(req.body?.reviewers) ? req.body.reviewers : [];
  const reviewers = [...new Set(raw.map(Number).filter(n => Number.isInteger(n)))];
  const dueAt = req.body?.due_at ? new Date(req.body.due_at) : null;
  const force = req.query.force === '1' || req.query.force === 'true';

  if (!submissionId || reviewers.length === 0) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return res.status(400).json({ error: 'Bad due_at' });
  }

  // fetch submission, author, category
  const s = await appDb.query(
    'SELECT id, author_user_id, category_id, status FROM submissions WHERE id=$1',
    [submissionId]
  );
  const sub = s.rows[0];
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  // block assignment if already decided (unless force)
  if (!force) {
    const d = await appDb.query('SELECT 1 FROM decisions WHERE submission_id=$1', [submissionId]);
    if (d.rowCount) return res.status(409).json({ error: 'Already decided; use ?force=1 to override' });
  }

  // remove author if included
  const filtered = reviewers.filter(uid => uid !== sub.author_user_id);

  // allowed reviewers (active + scoped)
  const vr = await appDb.query(
    `SELECT uc.user_id
       FROM user_categories uc
       JOIN users u ON u.id = uc.user_id
      WHERE uc.category_id=$1 AND uc.role_scope='reviewer'
        AND u.is_active = TRUE
        AND uc.user_id = ANY($2::int[])`,
    [sub.category_id, filtered]
  );
  const allowedSet = new Set(vr.rows.map(r => r.user_id));

  const accepted = filtered.filter(id => allowedSet.has(id));
  const rejected_not_scoped = filtered.filter(id => !allowedSet.has(id));
  const rejected_author = reviewers.filter(id => id === sub.author_user_id);

  try {
    await appDb.query('BEGIN');

    // insert assignments (idempotent with unique constraint)
    const ins = [];
    for (const rid of accepted) {
      await appDb.query(
        `INSERT INTO assignments (submission_id, reviewer_user_id, assigned_by_user_id, due_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (submission_id, reviewer_user_id) DO UPDATE
         SET due_at = COALESCE(EXCLUDED.due_at, assignments.due_at)`,
        [submissionId, rid, req.user.uid || null, dueAt || null]
      );
      // ensure a review row exists with status 'assigned'
      await appDb.query(
        `INSERT INTO reviews (submission_id, reviewer_user_id, status)
         VALUES ($1,$2,'assigned')
         ON CONFLICT (submission_id, reviewer_user_id) DO NOTHING`,
        [submissionId, rid]
      );
      ins.push(rid);
    }

    // move to under_review if this becomes the first assignment
    const count = await appDb.query(
      'SELECT COUNT(*)::int AS n FROM assignments WHERE submission_id=$1',
      [submissionId]
    );
    if (count.rows[0].n > 0 && sub.status === 'submitted') {
      await appDb.query(
        `UPDATE submissions SET status='under_review', updated_at=NOW() WHERE id=$1`,
        [submissionId]
      );
    }

    await appDb.query('COMMIT');

    await logSecurityEvent({
      traceId,
      actorUserId: req.user.uid,
      action: 'chair.assign',
      severity: 'info',
      entity_type: 'submission',
      entity_id: String(submissionId),
      details: {
        category: sub.category_id,
        accepted: ins,
        rejected_not_scoped,
        rejected_author,
        due_at: dueAt ? dueAt.toISOString() : null,
        forced: !!force
      }
    });

    res.json({
      ok: true,
      accepted,
      rejected: { not_scoped: rejected_not_scoped, author: rejected_author }
    });
  } catch (e) {
    await appDb.query('ROLLBACK');
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /chair/submissions/:id/unassign
 * body: { reviewers: [userId,...], force?: boolean }
 * - Removes assignment
 * - Removes review row if not yet submitted (unless you want to keep history)
 * - Blocks if review already submitted, unless force=true
 * - If no remaining assignments and no submitted reviews, can revert status to 'submitted'
 */
r.post('/chair/submissions/:id/unassign', requireAuth, requireChair, async (req, res) => {
  const traceId = `CHAIR-UNAS-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const submissionId = Number(req.params.id || 0);
  const raw = Array.isArray(req.body?.reviewers) ? req.body.reviewers : [];
  const reviewers = [...new Set(raw.map(Number).filter(n => Number.isInteger(n)))];
  const force = !!req.body?.force || req.query.force === '1' || req.query.force === 'true';

  if (!submissionId || reviewers.length === 0) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // quick check: any submitted reviews?
  const subm = await appDb.query(
    `SELECT reviewer_user_id FROM reviews
      WHERE submission_id=$1 AND reviewer_user_id = ANY($2::int[]) AND status='submitted'`,
    [submissionId, reviewers]
  );
  const submitted = new Set(subm.rows.map(r => r.reviewer_user_id));
  if (submitted.size && !force) {
    return res.status(409).json({ error: 'Some reviewers already submitted', reviewers: [...submitted] });
  }

  try {
    await appDb.query('BEGIN');

    // delete assignments
    await appDb.query(
      `DELETE FROM assignments
        WHERE submission_id=$1 AND reviewer_user_id = ANY($2::int[])`,
      [submissionId, reviewers]
    );

    // delete review rows only if not submitted (keep submitted for record)
    if (!force) {
      await appDb.query(
        `DELETE FROM reviews
          WHERE submission_id=$1 AND reviewer_user_id = ANY($2::int[]) AND status <> 'submitted'`,
        [submissionId, reviewers]
      );
    }

    // optionally, revert status if no assignments and no submitted reviews
    const left = await appDb.query(
      `SELECT
          (SELECT COUNT(*)::int FROM assignments WHERE submission_id=$1) AS n_asn,
          (SELECT COUNT(*)::int FROM reviews WHERE submission_id=$1 AND status='submitted') AS n_sub`,
      [submissionId]
    );
    if (left.rows[0].n_asn === 0 && left.rows[0].n_sub === 0) {
      await appDb.query(
        `UPDATE submissions SET status='submitted', updated_at=NOW() WHERE id=$1`,
        [submissionId]
      );
    }

    await appDb.query('COMMIT');

    await logSecurityEvent({
      traceId,
      actorUserId: req.user.uid,
      action: 'chair.unassign',
      severity: 'info',
      entity_type: 'submission',
      entity_id: String(submissionId),
      details: { reviewers, forced: !!force, had_submitted: subm.rows.length > 0 }
    });

    res.json({ ok: true, reviewers_unassigned: reviewers, forced: !!force });
  } catch (e) {
    await appDb.query('ROLLBACK');
    return res.status(500).json({ error: 'Server error' });
  }
});

export default r;
