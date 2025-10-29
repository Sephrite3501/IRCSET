import express from "express";
import {
  getExternalReviewPage,
  submitExternalReview,
} from "../controllers/externalController.js";
import {
  createExternalReviewer,
} from "../controllers/chairController.js"; // reuse existing logic

const router = express.Router();

/**
 * -----------------------------
 *  External Reviewer Access (Public)
 * -----------------------------
 */

// GET /api/external-review/:token
// → loads reviewer + assigned submissions
router.get("/external-review/:token", getExternalReviewPage);

// POST /api/external-review/:token/submit
// → submits review form
router.post("/external-review/:token/submit", submitExternalReview);

/**
 * -----------------------------
 *  Chair creates external reviewers
 * -----------------------------
 * (requires authentication middleware in your app.js)
 *
 * POST /api/chair/:eventId/external-reviewer
 * → creates external reviewer and returns invite link
 */
router.post("/chair/:eventId/external-reviewer", createExternalReviewer);

export default router;
