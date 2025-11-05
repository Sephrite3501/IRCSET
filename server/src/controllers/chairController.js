// server/src/controllers/chairController.js
import { appDb } from '../db/pool.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';
import { sendExternalReviewInvite } from "../services/emailService.js";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

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

// --- NEW: list events where current user is a chair ---
// GET /chair/my-events
export async function listMyEvents(req, res) {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Not authenticated' });

  const q = await appDb.query(
    `SELECT e.id, e.name, e.description, e.start_date, e.end_date, e.created_at
     FROM events e
     JOIN event_roles er ON er.event_id = e.id
     WHERE er.user_id = $1 AND er.role = 'chair'
     ORDER BY e.created_at DESC`,
    [uid]
  );

  res.json({ items: q.rows });
}

// --- NEW: add a reviewer role to this event ---
// POST /chair/:eventId/reviewers  body: { user_id }
export async function addEventReviewer(req, res) {
  const eventId = Number(req.params.eventId || 0);
  const userId = Number(req.body?.user_id || 0);
  if (!eventId || !userId) return res.status(400).json({ error: 'Invalid input' });

  // Only chairs of this event may add reviewers (requireEventRole('chair') also enforces)
  try {
    const ins = await appDb.query(
      `INSERT INTO event_roles (event_id, user_id, role)
       VALUES ($1,$2,'reviewer')
       ON CONFLICT (event_id, user_id, role) DO NOTHING
       RETURNING id, event_id, user_id, role`,
      [eventId, userId]
    );

    if (!ins.rowCount) {
      return res.status(400).json({ error: 'User already reviewer for this event' });
    }

    await logSecurityEvent({
      traceId: `CHAIR-ADDREV-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
      actorUserId: req.user.uid,
      action: 'chair.add_event_reviewer',
      severity: 'info',
      entity_type: 'event',
      entity_id: String(eventId),
      details: { user_id: userId, role: 'reviewer' }
    });

    res.json({ ok: true, role: ins.rows[0] });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- NEW: remove a reviewer role from this event ---
// DELETE /chair/:eventId/reviewers   body: { user_id }
export async function removeEventReviewer(req, res) {
  const eventId = Number(req.params.eventId || 0);
  const userId = Number(req.body?.user_id || 0);
  if (!eventId || !userId) return res.status(400).json({ error: 'Invalid input' });

  const del = await appDb.query(
    `DELETE FROM event_roles
     WHERE event_id=$1 AND user_id=$2 AND role='reviewer'`,
    [eventId, userId]
  );

  if (!del.rowCount) {
    return res.status(404).json({ error: 'Reviewer role not found for this event' });
  }

  await logSecurityEvent({
    traceId: `CHAIR-REMREV-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
    actorUserId: req.user.uid,
    action: 'chair.remove_event_reviewer',
    severity: 'info',
    entity_type: 'event',
    entity_id: String(eventId),
    details: { user_id: userId, role: 'reviewer' }
  });

  res.json({ ok: true });
}

// --- OPTIONAL: search active users to add as reviewers for this event ---
// GET /chair/:eventId/users?q=...&limit=20
export async function searchUsersForEvent(req, res) {
  const eventId = Number(req.params.eventId || 0);
  const q = String(req.query.q || '').trim().toLowerCase();
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
  if (!eventId) return res.status(400).json({ error: 'Event ID required' });

  const rows = await appDb.query(
    `SELECT u.id, u.email, u.name,
            EXISTS (
              SELECT 1 FROM event_roles er
              WHERE er.event_id = $1 AND er.user_id = u.id AND er.role='reviewer'
            ) AS is_event_reviewer
     FROM users u
     WHERE u.is_active = TRUE
       AND ($2 = '' OR LOWER(u.email) LIKE '%'||$2||'%' OR LOWER(u.name) LIKE '%'||$2||'%')
     ORDER BY u.name NULLS LAST, u.email
     LIMIT $3`,
    [eventId, q, limit]
  );

  res.json({ items: rows.rows });
}


export async function getAllReviewsForSubmission(req, res) {
  const { eventId, subId } = req.params;
  console.log("🔍 [DEBUG] Fetching all reviews for submission:", subId, "in event:", eventId);

  try {
    const query = `
      SELECT 
        r.id AS review_id,
        r.submission_id,
        r.reviewer_user_id,
        r.external_reviewer_id,
        COALESCE(u.name, er.name) AS reviewer_name,
        COALESCE(u.email, er.email) AS reviewer_email,
        CASE 
          WHEN r.external_reviewer_id IS NOT NULL THEN TRUE 
          ELSE FALSE 
        END AS is_external,
        r.score_technical,
        r.score_relevance,
        r.score_innovation,
        r.score_writing,
        r.score_overall,
        r.comments_for_author,
        r.comments_committee,
        r.submitted_at
      FROM reviews r
      JOIN assignments a 
        ON a.submission_id = r.submission_id
       AND (
         (r.reviewer_user_id IS NOT NULL AND a.reviewer_user_id = r.reviewer_user_id)
         OR (r.external_reviewer_id IS NOT NULL AND a.external_reviewer_id = r.external_reviewer_id)
       )
      LEFT JOIN users u ON a.reviewer_user_id = u.id
      LEFT JOIN external_reviewers er ON a.external_reviewer_id = er.id
      WHERE a.submission_id = $1 AND a.event_id = $2
      ORDER BY r.submitted_at DESC;
    `;

    console.log("🧾 [DEBUG] Executing query:\n", query);
    console.log("🧩 [DEBUG] Query params:", [subId, eventId]);

    const { rows } = await appDb.query(query, [subId, eventId]);

    console.log("📦 [DEBUG] Raw DB rows returned:", rows.length);
    if (rows.length === 0) console.log("⚠️ [DEBUG] No reviews found for this submission.");
    else console.log("✅ [DEBUG] Found reviews:", rows);

    res.json({ items: rows });
  } catch (err) {
    console.error("❌ [ERROR] Failed to fetch submission reviews:", err);
    res.status(500).json({ error: "Failed to load reviews" });
  }
}






export async function updateSubmissionStatus(req, res) {
  const { eventId, submissionId } = req.params;
  const { status } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  try {
    const result = await appDb.query(
      `UPDATE submissions
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND event_id = $3
       RETURNING id, title, status`,
      [status, submissionId, eventId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json({
      message: `Submission ${status}`,
      submission: result.rows[0]
    });
  } catch (err) {
    console.error("Error updating submission status:", err);
    res.status(500).json({ error: "Database error while updating submission" });
  }
}

export async function getApprovedSubmissions(req, res) {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: "Not authenticated" });

  try {
    const { rows } = await appDb.query(`
      SELECT
        e.id AS event_id,
        e.name AS event_name,
        json_agg(
          json_build_object(
            'id', s.id,
            'title', s.title,
            'authors', s.authors,
            'file_path', s.pdf_path,
            'final_pdf_path', s.final_pdf_path,
            'status', s.status
          )
        ) AS papers
      FROM submissions s
      JOIN events e ON e.id = s.event_id
      JOIN event_roles er ON er.event_id = e.id
      WHERE s.status IN ('approved', 'final_submitted')
        AND er.user_id = $1
        AND er.role = 'chair'
      GROUP BY e.id, e.name
      ORDER BY e.name ASC;
    `, [uid]);

    res.json({ items: rows });
  } catch (err) {
    console.error("Error fetching approved submissions:", err);
    res.status(500).json({ error: "Failed to load approved submissions" });
  }
}




//External Reviewer related
export async function createExternalReviewer(req, res) {
  const { eventId } = req.params;
  const { submissionId, name, email } = req.body;

  try {
    // Generate token and expiration
    const inviteToken = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 1️⃣ Insert into external_reviewers table
    const reviewerRes = await appDb.query(
      `INSERT INTO external_reviewers (name, email, invite_token, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name, email, inviteToken, expiresAt]
    );
    const externalReviewerId = reviewerRes.rows[0].id;

    // 2️⃣ Create assignment
    await appDb.query(
      `INSERT INTO assignments (event_id, submission_id, external_reviewer_id)
       VALUES ($1, $2, $3)`,
      [eventId, submissionId, externalReviewerId]
    );

    // 3️⃣ Generate review link
    const reviewLink = `${process.env.FRONTEND_BASE_URL}/external-review/${inviteToken}`;
    const pdfLink = `${process.env.BACKEND_BASE_URL}/external/${inviteToken}/submissions/${submissionId}/initial.pdf`;


    // 4️⃣ Fetch event and paper details
    const [eventRes, subRes] = await Promise.all([
      appDb.query(`SELECT name, start_date, end_date FROM events WHERE id = $1`, [eventId]),
      appDb.query(`SELECT title FROM submissions WHERE id = $1`, [submissionId])
    ]);
    const eventInfo = eventRes.rows[0] || {};
    const paperInfo = subRes.rows[0] || {};

    // 5️⃣ Send email (if email provided)
    if (email) {
      await sendExternalReviewInvite(email, name, reviewLink, paperInfo, eventInfo);
      console.log(`✅ Sent external review email to ${email}`);
    }

    // 6️⃣ Respond success
    res.json({
      ok: true,
      link: reviewLink
    });
  } catch (err) {
    console.error("❌ Error creating external reviewer:", err);
    res.status(500).json({ error: "Failed to create external reviewer" });
  }
}


