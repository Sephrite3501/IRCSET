import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { validateParamId, validateAssignBody } from '../utils/validators.js';
import {
  listSubmissions,
  listReviewers,
  listAssignments,
  assignReviewers,
  unassignReviewers,
} from '../controllers/chairController.js';

const r = Router();

// allow chair OR admin
function requireChair(req, res, next) {
  const role = req.user?.role;
  if (!role) return res.status(401).json({ error: 'Unauthorized' });
  if (role === 'chair' || role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

// Mounted at /chair in app.js

// Reads
r.get('/submissions', requireAuth, requireChair, listSubmissions);
r.get('/reviewers',   requireAuth, requireChair, listReviewers);
r.get('/submissions/:id/assignments',
  requireAuth, requireChair, validateParamId('id'),
  listAssignments
);

// Writes (CSRF enforced globally by app.js)
r.post('/submissions/:id/assign',
  requireAuth, requireChair, writeLimiter, validateParamId('id'), validateAssignBody,
  assignReviewers
);

r.post('/submissions/:id/unassign',
  requireAuth, requireChair, writeLimiter, validateParamId('id'), validateAssignBody,
  unassignReviewers
);

export default r;
