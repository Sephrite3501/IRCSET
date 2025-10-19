// server/src/routes/reviewer.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireEventRole } from '../middleware/requireEventRole.js';
import {
  listAssignments,
  submitReview,
  listReviewerEvents,
  getPaperDetails,
  getPaperReviewDetails
} from '../controllers/reviewerController.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { validateParamId, validateReviewBody } from '../utils/validators.js';

const r = Router();

// Fetch all reviewer events
r.get('/events', requireAuth, listReviewerEvents);

// Fetch specific paper details
r.get(
  '/events/:eventId/papers/:paperId',
  requireAuth,
  requireEventRole('reviewer'),
  getPaperDetails
);

// List reviewer assignments for an event
r.get(
  '/events/:eventId/reviewer/assignments',
  requireAuth,
  requireEventRole('reviewer'),
  listAssignments
);


r.get(
  '/events/:eventId/papers/:paperId/review',
  requireAuth, requireEventRole('reviewer'),
  getPaperReviewDetails
);

// Submit a review for a paper
r.post(
  '/events/:eventId/papers/:paperId/reviews',
  requireAuth,
  requireEventRole('reviewer'),
  writeLimiter,
  validateParamId('paperId'),
  validateReviewBody,
  submitReview
);


export default r;
