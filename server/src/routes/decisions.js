// server/src/routes/decisions.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { appDb } from '../db/pool.js';
import { cleanText } from '../utils/validators.js';

const r = Router();

/**
 * GET /decisions/queue
 * Decision Maker queue (category-scoped):
 * - submissions in the user's categories
 * - not yet decided
 * - show aggregated review info
 */
r.get('/decisions/queue', requireAuth, requireRole('decision_maker'), async (req, res) => {
  // fetch category scopes
  const cq = await appDb.query(
    `SELECT category_id FROM user_categories WHERE user_id=$1 AND role_scope='decision_maker'`,
    [req.user.uid]
  );
  const cats = cq.rows.map(r => r.category_id);
  if (cats.length === 0) return res.json({ items: [] });

  // Queue: submissions in scoped categories that do not have a decision yet
  // Include simple aggregates from reviews
  const q = await appDb.query(
    `
    SELECT
      s.id,
      s.title,
      s.category_id,
      s.status,
      s.created_at,
      COALESCE(agg.n_reviews, 0) AS n_reviews,
      COALESCE(agg.avg_score, 0)::float AS avg_score
    FROM submissions s
    LEFT JOIN (
      SELECT submission_id,
             COUNT(*) FILTER (WHERE status='submitted') AS n_reviews,
             AVG(score_overall) FILTER (WHERE status='submitted') AS avg_score
      FROM reviews
      GROUP BY submission_id
    ) agg ON agg.submission_id = s.id
    LEFT JOIN decisions d ON d.submission_id = s.id
    WHERE s.category_id = ANY($1::text[])
      AND d.submission_id IS NULL
      AND s.status IN ('under_review','decision_made')  -- show items awaiting decision or where someone started process
    ORDER BY s.created_at DESC
    `,
    [cats]
  );

  res.json({ items: q.rows });
});

/**
 * GET /decisions/:submission_id
 * Detail view for a single submission (category-scoped), with reviews.
 */
r.get('/decisions/:submission_id', requireAuth, requireRole('decision_maker'), async (req, res) => {
  const sid = Number(req.params.submission_id || 0);
  if (!sid) return res.status(400).json({ error: 'Bad id' });

  // Ensure this submission is in a category the DM can access
  const s = await appDb.query(
    `SELECT s.id, s.title, s.category_id, s.status, s.created_at
       FROM submissions s
      WHERE s.id=$1`,
    [sid]
  );
  const sub = s.rows[0];
  if (!sub) return res.status(404).json({ error: 'Not found' });

  const cq = await appDb.query(
    `SELECT 1 FROM user_categories WHERE user_id=$1 AND role_scope='decision_maker' AND category_id=$2`,
    [req.user.uid, sub.category_id]
  );
  if (!cq.rowCount) return res.status(403).json({ error: 'Forbidden: category scope' });

  const reviews = await appDb.query(
    `SELECT score_overall, comments_for_author, submitted_at
       FROM reviews
      WHERE submission_id=$1 AND status='submitted'
      ORDER BY submitted_at DESC`,
    [sid]
  );

  res.json({ submission: sub, reviews: reviews.rows });
});

/**
 * POST /decisions/:submission_id
 * Body: { decision: 'accepted' | 'rejected', reason?: string }
 * Rules:
 *  - DM must be scoped to that submission's category
 *  - Only one decision per submission (enforced by unique index)
 *  - If accepted -> set submission.status = 'final_required'
 *  - If rejected -> keep status at 'decision_made'
 */
r.post('/decisions/:submission_id', requireAuth, requireRole('decision_maker'), async (req, res) => {
  const sid = Number(req.params.submission_id || 0);
  const decision = cleanText(req.body?.decision, { max: 16 }).toLowerCase();
  const reason = cleanText(req.body?.reason, { max: 2000 });

  if (!sid || !['accepted','rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // load submission + category
  const s = await appDb.query('SELECT id, category_id, status FROM submissions WHERE id=$1', [sid]);
  const sub = s.rows[0];
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  // enforce category scope
  const cq = await appDb.query(
    `SELECT 1 FROM user_categories WHERE user_id=$1 AND role_scope='decision_maker' AND category_id=$2`,
    [req.user.uid, sub.category_id]
  );
  if (!cq.rowCount) return res.status(403).json({ error: 'Forbidden: category scope' });

  // insert decision (unique per submission)
  const ins = await appDb.query(
    `INSERT INTO decisions (submission_id, decider_user_id, category_id, decision, reason)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (submission_id) DO NOTHING
     RETURNING id, decision, decided_at`,
    [sid, req.user.uid, sub.category_id, decision, reason || null]
  );

  if (!ins.rowCount) {
    // already decided
    const d = await appDb.query('SELECT decision, decided_at FROM decisions WHERE submission_id=$1', [sid]);
    return res.status(409).json({ error: 'Already decided', decision: d.rows[0] });
  }

  // bump submission status
  if (decision === 'accepted') {
    await appDb.query(`UPDATE submissions SET status='final_required', updated_at=NOW() WHERE id=$1`, [sid]);
  } else {
    await appDb.query(`UPDATE submissions SET status='decision_made', updated_at=NOW() WHERE id=$1`, [sid]);
  }

  res.json({ ok: true, decision: ins.rows[0] });
});

export default r;
