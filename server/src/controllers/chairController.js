// server/src/controllers/chairController.js
import { appDb } from '../db/pool.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

/**
 * GET /chair/:eventId/submissions
 * Query: ?status=&q=&page=1&limit=50
 */
export async function listSubmissions(req, res) {
  const eventId = Number(req.params.eventId || 0);
  if (!eventId) return res.status(400).json({ error: 'Event ID required' });

  const status = String(req.query.status || '').trim();
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const offset = (page - 1) * limit;

  const params = [eventId];
  const where = ['s.event_id = $1'];

  if (status) {
    params.push(status);
    where.push(`s.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`LOWER(s.title) LIKE $${params.length}`);
  }
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
      s.id, s.title, s.status, s.created_at,
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
 * GET /chair/:eventId/reviewers
 */
export async function listReviewers(req, res) {
  const eventId = Number(req.params.eventId || 0);
  if (!eventId) return res.status(400).json({ error: 'Event ID required' });

  const q = await appDb.query(
    `SELECT u.id, u.email, u.name,
            (SELECT COUNT(*) FROM assignments a WHERE a.reviewer_user_id = u.id) AS n_assigned_total
     FROM event_roles er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id=$1 AND er.role='reviewer' AND u.is_active=TRUE
     ORDER BY u.name ASC`,
    [eventId]
  );
  res.json({ items: q.rows, event_id: eventId });
}

/**
 * GET /chair/:eventId/submissions/:id/assignments
 */
export async function listAssignments(req, res) {
  const sid = Number(req.params.id || 0);
  if (!sid) return res.status(400).json({ error: 'Bad submission ID' });

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
 * POST /chair/:eventId/submissions/:id/assign
 */
export async function assignReviewers(req, res) {
  const traceId = `CHAIR-ASN-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const submissionId = Number(req.params.id || 0);
  const eventId = Number(req.params.eventId || 0);
  const raw = Array.isArray(req.body?.reviewers) ? req.body.reviewers : [];
  const reviewers = [...new Set(raw.map(Number).filter(Number.isInteger))];
  const dueAt = req.body?.due_at ? new Date(req.body.due_at) : null;
  const force = req.query.force === '1' || req.query.force === 'true';

  if (!submissionId || !eventId || reviewers.length === 0) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return res.status(400).json({ error: 'Bad due_at' });
  }

  const s = await appDb.query(
    'SELECT id, author_user_id, event_id, status FROM submissions WHERE id=$1',
    [submissionId]
  );
  const sub = s.rows[0];
  if (!sub || sub.event_id !== eventId) {
    return res.status(404).json({ error: 'Submission not found in this event' });
  }

  if (!force) {
    const d = await appDb.query('SELECT 1 FROM decisions WHERE submission_id=$1', [submissionId]);
    if (d.rowCount) return res.status(409).json({ error: 'Already decided; use ?force=1 to override' });
  }

  const filtered = reviewers.filter(uid => uid !== sub.author_user_id);

  const vr = await appDb.query(
    `SELECT user_id FROM event_roles
     WHERE event_id=$1 AND role='reviewer' AND user_id = ANY($2::int[])`,
    [eventId, filtered]
  );
  const allowedSet = new Set(vr.rows.map(r => r.user_id));

  const accepted = filtered.filter(id => allowedSet.has(id));
  const rejected_not_reviewer = filtered.filter(id => !allowedSet.has(id));
  const rejected_author = reviewers.filter(id => id === sub.author_user_id);

  try {
    await appDb.query('BEGIN');

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
        event_id: eventId,
        accepted,
        rejected_not_reviewer,
        rejected_author,
        due_at: dueAt ? dueAt.toISOString() : null,
        forced: !!force
      }
    });

    res.json({ ok: true, accepted, rejected: { not_reviewer: rejected_not_reviewer, author: rejected_author } });
  } catch (e) {
    await appDb.query('ROLLBACK');
    return res.status(500).json({ error: 'Server error' });
  }
}

/**
 * POST /chair/:eventId/submissions/:id/unassign
 */
export async function unassignReviewers(req, res) {
  const traceId = `CHAIR-UNAS-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const submissionId = Number(req.params.id || 0);
  const eventId = Number(req.params.eventId || 0);
  const raw = Array.isArray(req.body?.reviewers) ? req.body.reviewers : [];
  const reviewers = [...new Set(raw.map(Number).filter(Number.isInteger))];
  const force = !!req.body?.force || req.query.force === '1' || req.query.force === 'true';

  if (!submissionId || !eventId || reviewers.length === 0) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const sub = await appDb.query(
    'SELECT id, event_id FROM submissions WHERE id=$1',
    [submissionId]
  );
  if (!sub.rowCount || sub.rows[0].event_id !== eventId) {
    return res.status(404).json({ error: 'Submission not found in this event' });
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
