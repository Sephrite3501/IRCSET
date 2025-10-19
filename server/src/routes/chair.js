// server/src/routes/chair.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireEventRole } from '../middleware/requireEventRole.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { validateParamId } from '../utils/validators.js';

import {
  listSubmissions,
  listReviewers,
  listAssignments,
  assignReviewers,
  unassignReviewers,
  // NEW:
  listMyEvents,
  addEventReviewer,
  removeEventReviewer,
  searchUsersForEvent,
  getAllReviewsForSubmission,
} from '../controllers/chairController.js';

import {
  listQueue,
  getDecisionDetail,
  makeDecision,
} from '../controllers/decisionsController.js';

import { listReviewsForChair } from '../controllers/reviewsReadController.js';

const r = Router();

// --------------------
// Chair: Submissions
// --------------------
r.get('/:eventId/submissions',
  requireAuth, requireEventRole('chair'),
  listSubmissions
);

r.get('/:eventId/reviewers',
  requireAuth, requireEventRole('chair'),
  listReviewers
);

r.get('/:eventId/submissions/:id/assignments',
  requireAuth, requireEventRole('chair'),
  validateParamId('id'),
  listAssignments
);

r.post('/:eventId/submissions/:id/assign',
  requireAuth, requireEventRole('chair'),
  writeLimiter, validateParamId('id'),
  assignReviewers
);

r.post('/:eventId/submissions/:id/unassign',
  requireAuth, requireEventRole('chair'),
  writeLimiter, validateParamId('id'),
  unassignReviewers
);

r.get('/:eventId/submissions/:id/reviews',
  requireAuth, requireEventRole('chair'),
  validateParamId('id'),
  listReviewsForChair
);

// --------------------
// Chair: Decisions
// --------------------
r.get('/:eventId/decisions/queue',
  requireAuth, requireEventRole('chair'),
  listQueue
);

r.get('/:eventId/decisions/:submission_id',
  requireAuth, requireEventRole('chair'),
  validateParamId('submission_id'),
  getDecisionDetail
);

r.post('/:eventId/decisions/:submission_id',
  requireAuth, requireEventRole('chair'),
  writeLimiter, validateParamId('submission_id'),
  makeDecision
);


// Chair: list my events (no :eventId to check)
r.get('/my-events',
  requireAuth,            // must be logged in
  listMyEvents
);

// Chair: add/remove reviewer role for this event
r.post('/:eventId/reviewers',
  requireAuth, requireEventRole('chair'),
  addEventReviewer
);

r.delete('/:eventId/reviewers',
  requireAuth, requireEventRole('chair'),
  removeEventReviewer
);

// OPTIONAL: search active users to add as reviewers for this event
r.get('/:eventId/users',
  requireAuth, requireEventRole('chair'),
  searchUsersForEvent
);

r.get(
  '/:eventId/submissions/:submissionId/reviews',
  requireAuth,
  requireEventRole('chair'),
  getAllReviewsForSubmission
);

export default r;
