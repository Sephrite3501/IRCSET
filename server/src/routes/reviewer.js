// Mounted at /reviewer in app.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { listAssignments, submitReview } from '../controllers/reviewerController.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { validateParamId, validateReviewBody } from '../utils/validators.js';

const r = Router();

// Reads
r.get('/assignments',
  requireAuth, requireRole('reviewer'),
  listAssignments
);

// Writes (CSRF enforced globally by app.js)
r.post('/submissions/:id/reviews',
  requireAuth, requireRole('reviewer'), writeLimiter,
  validateParamId('id'), validateReviewBody,
  submitReview
);

export default r;
