import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { validateParamId, validateDecisionBody } from '../utils/validators.js';
import {
  attachDecisionScope,
  listQueue,
  getDecisionDetail,
  makeDecision,
} from '../controllers/decisionsController.js';

const r = Router();

// Mounted at /decisions in app.js

// Reads
r.get('/queue',
  requireAuth, requireRole('decision_maker'), attachDecisionScope,
  listQueue
);

r.get('/:submission_id',
  requireAuth, requireRole('decision_maker'), attachDecisionScope,
  validateParamId('submission_id'),
  getDecisionDetail
);

// Writes (CSRF enforced globally by app.js)
r.post('/:submission_id',
  requireAuth, requireRole('decision_maker'), writeLimiter, attachDecisionScope,
  validateParamId('submission_id'), validateDecisionBody,
  makeDecision
);

export default r;
