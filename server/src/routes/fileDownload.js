import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { getInitialPdf, getFinalPdf } from '../controllers/fileDownloadController.js';
import { validateParamId } from '../utils/validators.js';
import { appDb } from '../db/pool.js';

const r = Router();

/* -------- Events-first patterns -------- */
r.get(
  '/events/:eventId/submissions/:id/initial.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getInitialPdf
);


r.get('/external/:token/submissions/:id/initial.pdf', async (req, res) => {
  const { token, id } = req.params;
  console.log("🔍 [DEBUG] External PDF request received", { token, id });

  try {
    const rev = await appDb.query(
      `SELECT id, name, email, expires_at FROM external_reviewers WHERE invite_token = $1`,
      [token]
    );

    if (!rev.rowCount) {
      console.log("❌ [DEBUG] No reviewer found for token");
      return res.status(403).json({ error: "Invalid or expired link" });
    }

    const reviewer = rev.rows[0];
    console.log("✅ [DEBUG] Reviewer found:", reviewer);

    if (new Date(reviewer.expires_at) < new Date()) {
      console.log("⚠️ [DEBUG] Token expired:", reviewer.expires_at);
      return res.status(403).json({ error: "Token expired" });
    }

    // ✅ Token is valid, forward to getInitialPdf
    req.params.id = id;
    console.log("➡️ [DEBUG] Passing to getInitialPdf");
    return getInitialPdf(req, res);
  } catch (err) {
    console.error("💥 [ERROR] External PDF route failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


r.get(
  '/events/:eventId/submissions/:id/final.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getFinalPdf
);

/* -------- Submissions-first patterns (your other style) -------- */
r.get(
  '/submissions/:eventId/:id/initial.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getInitialPdf
);

r.get(
  '/submissions/:eventId/:id/final.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getFinalPdf
);

export default r;
