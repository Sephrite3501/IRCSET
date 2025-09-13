// server/src/routes/reviewer.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireEventRole } from '../middleware/requireEventRole.js';
import { listAssignments, submitReview } from '../controllers/reviewerController.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { validateParamId, validateReviewBody } from '../utils/validators.js';

const r = Router();

// List reviewer assignments for an event
r.get('/events/:eventId/reviewer/assignments',
  requireAuth, requireEventRole('reviewer'),
  listAssignments
);

// Submit a review for a submission in an event
r.post('/events/:eventId/submissions/:id/reviews',
  requireAuth, requireEventRole('reviewer'), writeLimiter,
  validateParamId('id'), validateReviewBody,
  submitReview
);

export default r;
