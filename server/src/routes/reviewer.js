// server/src/routes/reviewerRoutes.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { listAssignments, submitReview } from '../controllers/reviewerController.js';

const r = Router();

// GET /reviewer/assignments
r.get('/reviewer/assignments', requireAuth, requireRole('reviewer'), listAssignments);

// POST /reviewer/submissions/:id/reviews
r.post('/reviewer/submissions/:id/reviews', requireAuth, requireRole('reviewer'), submitReview);

export default r;
