import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import {
  listSubmissions,
  listReviewers,
  listAssignments,
  assignReviewers,
  unassignReviewers,
} from '../controllers/chairController.js';

const r = Router();

/** allow chair OR admin */
function requireChair(req, res, next) {
  const role = req.user?.role;
  if (!role) return res.status(401).json({ error: 'Unauthorized' });
  if (role === 'chair' || role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

// NOTE: we mount this router at '/chair' in app.js
r.get('/submissions', requireAuth, requireChair, listSubmissions);
r.get('/reviewers', requireAuth, requireChair, listReviewers);
r.get('/submissions/:id/assignments', requireAuth, requireChair, listAssignments);
r.post('/submissions/:id/assign', requireAuth, requireChair, assignReviewers);
r.post('/submissions/:id/unassign', requireAuth, requireChair, unassignReviewers);

export default r;
