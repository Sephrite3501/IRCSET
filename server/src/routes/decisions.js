// server/src/routes/decisions.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { appDb } from '../db/pool.js';
import { cleanText } from '../utils/validators.js';
import { decisionsMadeTotal } from '../utils/metrics.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

const r = Router();

/** Get DM categories (admin => all categories) and attach to req.user.dmCategories */
async function attachDecisionScope(req, res, next) {
  try {
    const { uid, role } = req.user || {};
    if (!uid) return res.status(401).json({ error: 'Unauthenticated' });

    if (role === 'admin') {
      const all = await appDb.query('SELECT id FROM categories ORDER BY id');
      req.user.dmCategories = all.rows.map(x => x.id);
      req.user.isAdmin = true;
      return next();
    }

    if (role !== 'decision_maker') {
      return res.status(403).json({ error: 'Forbidden: role' });
    }

    const cq = await appDb.query(
      `SELECT category_id FROM user_categories WHERE user_id=$1 AND role_scope='decision_maker'`,
      [uid]
    );
    const cats = cq.rows.map(r => r.category_id);
    if (!cats.length) return res.status(403).json({ error: 'No categories assigned' });
    req.user.dmCategories = cats;
    req.user.isAdmin = false;
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}

/**
 * GET /decisions/queue
 * Query params:
 *   ?min=<int>  Minimum # of submitted reviews required (default 1 or env DM_MIN_REVIEWS)
 */
r.get('/decisions/queue', requireAuth, attachDecisionScope, async (req, res) => {
  const min = Math.max(
    1,
    parseInt(req.query.min ?? process.env.DM_MIN_REVIEWS ?? '1', 10)
  );

  const q = await appDb.query(
    `
    WITH agg AS (
      SELECT submission_id,
             COUNT(*) FILTER (WHERE status='submitted') AS n_reviews,
             AVG(score_overall) FILTER (WHERE status='submitted') AS avg_score
      FROM reviews
      GROUP BY submission_id
    )
    SELECT
      s.id,
      s.title,
      s.category_id,
      s.status,
      s.created_at,
      COALESCE(agg.n_reviews, 0) AS n_reviews,
      COALESCE(agg.avg_score, 0)::float AS avg_score
    FROM submissions s
    LEFT JOIN agg ON agg.submission_id = s.id
    LEFT JOIN decisions d ON d.submission_id = s.id
    WHERE s.category_id = ANY($1::text[])
      AND d.submission_id IS NULL                  -- not decided yet
      AND s.status IN ('submitted','under_review') -- only undecided flows
      AND COALESCE(agg.n_reviews,0) >= $2          -- enough reviews
    ORDER BY s.created_at ASC
    `,
    [req.user.dmCategories, min]
  );

  res.json({ items: q.rows, scope: req.user.dmCategories, minReviews: min });
});

/**
 * GET /decisions/:submission_id
 * Detail view (category-scoped) with reviews and current decision (if any).
 */
r.get('/decisions/:submission_id', requireAuth, attachDecisionScope, async (req, res) => {
  const sid = Number(req.params.submission_id || 0);
  if (!sid) return res.status(400).json({ error: 'Bad id' });

  const s = await appDb.query(
    `SELECT id, title, abstract, keywords, category_id, status, created_at
       FROM submissions WHERE id=$1`,
    [sid]
  );
  const sub = s.rows[0];
  if (!sub) return res.status(404).json({ error: 'Not found' });
  if (!req.user.dmCategories.includes(sub.category_id)) {
    return res.status(403).json({ error: 'Forbidden: category scope' });
  }

  const reviews = await appDb.query(
    `SELECT reviewer_user_id, score_overall, status, submitted_at,
            comments_for_author, comments_confidential
       FROM reviews
      WHERE submission_id=$1
      ORDER BY submitted_at DESC NULLS LAST`,
    [sid]
  );

  const dec = await appDb.query(
    `SELECT decision, reason, decided_at, decider_user_id
       FROM decisions WHERE submission_id=$1`,
    [sid]
  );

  // Aggregate for convenience
  const submitted = reviews.rows.filter(r => r.status === 'submitted');
  const avg_score =
    submitted.length
      ? submitted.reduce((a, b) => a + Number(b.score_overall || 0), 0) / submitted.length
      : 0;

  res.json({
    submission: sub,
    reviews: submitted,   // only submitted reviews
    n_reviews: submitted.length,
    avg_score,
    decision: dec.rows[0] || null
  });
});

/**
 * POST /decisions/:submission_id
 * Body: { decision: 'accepted' | 'rejected', reason?: string }
 * Rules:
 *  - Must be in scoped categories (admin bypass)
 *  - Require >= min submitted reviews (unless admin overrides with ?force=1)
 *  - Only one decision per submission (unique index)
 *  - accepted  -> submissions.status = 'final_required'
 *  - rejected  -> submissions.status = 'decision_made'
 */
r.post('/decisions/:submission_id', requireAuth, attachDecisionScope, async (req, res) => {
  const traceId = `DECIDE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const sid = Number(req.params.submission_id || 0);
  const decision = cleanText(String(req.body?.decision || ''), { max: 16 }).toLowerCase();
  const reason = cleanText(String(req.body?.reason || ''), { max: 2000 }) || null;
  const min = Math.max(1, parseInt(req.query.min ?? process.env.DM_MIN_REVIEWS ?? '1', 10));
  const force = req.user.isAdmin && (req.query.force === '1' || req.query.force === 'true');

  if (!sid || !['accepted', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // Load submission
  const s = await appDb.query(
    `SELECT id, author_user_id, category_id, status, irc_member_email_optional
       FROM submissions WHERE id=$1`,
    [sid]
  );
  const sub = s.rows[0];
  if (!sub) return res.status(404).json({ error: 'Submission not found' });
  if (!req.user.dmCategories.includes(sub.category_id)) {
    await logSecurityEvent({ traceId, actorUserId: req.user.uid, action: 'decision.forbidden', severity: 'warn',
      entity_type: 'submission', entity_id: String(sid), details: { category: sub.category_id }});
    return res.status(403).json({ error: 'Forbidden: category scope' });
  }

  // Ensure enough submitted reviews unless admin forcing
  if (!force) {
    const rc = await appDb.query(
      `SELECT COUNT(*)::int AS n
         FROM reviews WHERE submission_id=$1 AND status='submitted'`,
      [sid]
    );
    if (rc.rows[0].n < min) {
      return res.status(409).json({ error: 'Insufficient submitted reviews', have: rc.rows[0].n, want: min });
    }
  }

  const newStatus = decision === 'accepted' ? 'final_required' : 'decision_made';

  // Transaction: insert decision (once) and bump status
  try {
    await appDb.query('BEGIN');

    const ins = await appDb.query(
      `INSERT INTO decisions (submission_id, decider_user_id, category_id, decision, reason)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (submission_id) DO NOTHING
       RETURNING id, decision, reason, decided_at, decider_user_id`,
      [sid, req.user.uid, sub.category_id, decision, reason]
    );

    if (!ins.rowCount) {
      await appDb.query('ROLLBACK');
      const d = await appDb.query(
        `SELECT decision, reason, decided_at, decider_user_id FROM decisions WHERE submission_id=$1`,
        [sid]
      );
      return res.status(409).json({ error: 'Already decided', decision: d.rows[0] });
    }

    await appDb.query(
      `UPDATE submissions SET status=$1, updated_at=NOW() WHERE id=$2`,
      [newStatus, sid]
    );

    await appDb.query('COMMIT');

    await logSecurityEvent({
      traceId,
      actorUserId: req.user.uid,
      action: 'decision.save',
      severity: 'info',
      entity_type: 'submission',
      entity_id: String(sid),
      details: { decision, newStatus, category: sub.category_id, reason_len: reason ? reason.length : 0 }
    });
    decisionsMadeTotal.labels(decision).inc();
    return res.json({ ok: true, decision: ins.rows[0], submission_status: newStatus });
  } catch (e) {
    await appDb.query('ROLLBACK');
    await logSecurityEvent({ traceId, actorUserId: req.user.uid, action: 'decision.error', severity: 'error',
      entity_type: 'submission', entity_id: String(sid), details: { message: e.message }});
    return res.status(500).json({ error: 'Server error' });
  }
});

export default r;
