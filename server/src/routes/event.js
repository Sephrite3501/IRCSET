import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireEventRole } from '../middleware/requireEventRole.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { validateParamId } from '../utils/validators.js';
import {
  registerForEvent,
  assignReviewer,
  submitReview,
  makeDecision,
  getAllEvents
} from '../controllers/eventController.js';

const router = Router();

// Mounted at /events in app.js
router.get("/", getAllEvents);
// Register for event (user becomes author role)
router.post(
  '/:eventId/register',
  requireAuth,
  validateParamId('eventId'),
  registerForEvent
);

// Chair assigns reviewer
router.post(
  '/:eventId/submissions/:submissionId/assign',
  requireAuth,
  requireEventRole('chair'),
  writeLimiter,
  validateParamId('eventId'),
  validateParamId('submissionId'),
  assignReviewer
);

// Reviewer submits review
router.post(
  '/:eventId/submissions/:submissionId/reviews',
  requireAuth,
  requireEventRole('reviewer'),
  writeLimiter,
  validateParamId('eventId'),
  validateParamId('submissionId'),
  submitReview
);

// Chair makes decision
router.post(
  '/:eventId/submissions/:submissionId/decision',
  requireAuth,
  requireEventRole('chair'),
  writeLimiter,
  validateParamId('eventId'),
  validateParamId('submissionId'),
  makeDecision
);

export default router;
