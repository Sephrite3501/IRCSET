// server/src/controllers/chairController.js
import { appDb } from '../db/pool.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

/**
 * GET /chair/submissions
 * Query: ?status=&category=&q=&page=1&limit=50
 */
export async function listSubmissions(req, res) {
  const status = String(req.query.status || '').trim();
  const category = String(req.query.category || '').trim();
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset = (page - 1) * limit;

  const params = [];
  const where = ['1=1'];

  if (status)   { params.push(status);   where.push(`s.status = $${params.length}`); }
  if (category) { params.push(category); where.push(`s.category_id = $${params.length}`); }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`LOWER(s.title) LIKE $${params.length}`);
  }

  // push limit/offset as params (safer than string interpolation)
  params.push(limit, offset);

  const sql = `
    WITH asn AS (
      SELECT submission_id, COUNT(*)::int AS n_assigned
      FROM assignments
      GROUP BY submission_id
    ),
    rev AS (
      SELECT submission_id,
             COUNT(*) FILTER (WHERE status='submitted')::int AS n_submitted,
             AVG(score_overall) FILTER (WHERE status='submitted')::float AS avg_score
      FROM reviews
      GROUP BY submission_id
    )
    SELECT
      s.id, s.title, s.category_id, s.status, s.created_at,
      COALESCE(d.decision, '') AS decision,
      COALESCE(asn.n_assigned, 0) AS n_assigned,
      COALESCE(rev.n_submitted, 0) AS n_submitted,
      COALESCE(rev.avg_score, 0)::float AS avg_score
    FROM submissions s
    LEFT JOIN decisions d ON d.submission_id = s.id
    LEFT JOIN asn ON asn.submission_id = s.id
    LEFT JOIN rev ON rev.submission_id = s.id
    WHERE ${where.join(' AND ')}
    ORDER BY s.created_at DESC
    LIMIT $${params.length-1} OFFSET $${params.length}
  `;
  const rows = await appDb.query(sql, params);
  res.json({ items: rows.rows, page, limit });
}

/**
 * GET /chair/reviewers?category=A
 */
export async function listReviewers(req, res) {
  const cat = String(req.query.category || '').trim().toUpperCase();
  if (!cat) return res.status(400).json({ error: 'category required' });

  const q = await appDb.query(
    `SELECT u.id, u.email, u.name,
            (SELECT COUNT(*) FROM assignments a WHERE a.reviewer_user_id = u.id) AS n_assigned_total
       FROM users u
       JOIN user_categories uc ON uc.user_id = u.id
      WHERE u.is_active = TRUE
        AND u.role='reviewer'
        AND uc.role_scope='reviewer'
        AND uc.category_id = $1
      ORDER BY u.id ASC`,
    [cat]
  );
  res.json({ items: q.rows, category: cat });
}

/**
 * GET /chair/submissions/:id/assignments
 */
export async function listAssignments(req, res) {
  const sid = Number(req.params.id || 0);
  if (!sid) return res.status(400).json({ error: 'Bad id' });

  const q = await appDb.query(
    `SELECT a.reviewer_user_id AS reviewer_id, u.email, u.name, a.assigned_at, a.due_at,
            r.status AS review_status, r.submitted_at
       FROM assignments a
       JOIN users u ON u.id = a.reviewer_user_id
  LEFT JOIN reviews r ON r.submission_id = a.submission_id AND r.reviewer_user_id = a.reviewer_user_id
      WHERE a.submission_id = $1
      ORDER BY a.assigned_at ASC`,
    [sid]
  );
  res.json({ items: q.rows, submission_id: sid });
}

/**
 * POST /chair/submissions/:id/assign
 * body: { reviewers: [userId,...], due_at?: ISO8601 }
 */
export async function assignReviewers(req, res) {
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

  const s = await appDb.query(
    'SELECT id, author_user_id, category_id, status FROM submissions WHERE id=$1',
    [submissionId]
  );
  const sub = s.rows[0];
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  if (!force) {
    const d = await appDb.query('SELECT 1 FROM decisions WHERE submission_id=$1', [submissionId]);
    if (d.rowCount) return res.status(409).json({ error: 'Already decided; use ?force=1 to override' });
  }

  const filtered = reviewers.filter(uid => uid !== sub.author_user_id);

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

    const inserted = [];
    for (const rid of accepted) {
      await appDb.query(
        `INSERT INTO assignments (submission_id, reviewer_user_id, assigned_by_user_id, due_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (submission_id, reviewer_user_id) DO UPDATE
         SET due_at = COALESCE(EXCLUDED.due_at, assignments.due_at)`,
        [submissionId, rid, req.user.uid || null, dueAt || null]
      );
      await appDb.query(
        `INSERT INTO reviews (submission_id, reviewer_user_id, status)
         VALUES ($1,$2,'assigned')
         ON CONFLICT (submission_id, reviewer_user_id) DO NOTHING`,
        [submissionId, rid]
      );
      inserted.push(rid);
    }

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
        accepted: inserted,
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
}

/**
 * POST /chair/submissions/:id/unassign
 * body: { reviewers: [userId,...], force?: boolean }
 */
export async function unassignReviewers(req, res) {
  const traceId = `CHAIR-UNAS-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const submissionId = Number(req.params.id || 0);
  const raw = Array.isArray(req.body?.reviewers) ? req.body.reviewers : [];
  const reviewers = [...new Set(raw.map(Number).filter(n => Number.isInteger(n)))];
  const force = !!req.body?.force || req.query.force === '1' || req.query.force === 'true';

  if (!submissionId || reviewers.length === 0) {
    return res.status(400).json({ error: 'Invalid input' });
  }

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

    await appDb.query(
      `DELETE FROM assignments
        WHERE submission_id=$1 AND reviewer_user_id = ANY($2::int[])`,
      [submissionId, reviewers]
    );

    if (!force) {
      await appDb.query(
        `DELETE FROM reviews
          WHERE submission_id=$1 AND reviewer_user_id = ANY($2::int[]) AND status <> 'submitted'`,
        [submissionId, reviewers]
      );
    }

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
}
