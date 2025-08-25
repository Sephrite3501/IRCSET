import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import {
  attachDecisionScope,
  listQueue,
  getDecisionDetail,
  makeDecision,
} from '../controllers/decisionsController.js';

const r = Router();

// NOTE: this router is mounted at '/decisions' in app.js
r.get('/queue', requireAuth, attachDecisionScope, listQueue);
r.get('/:submission_id', requireAuth, attachDecisionScope, getDecisionDetail);
r.post('/:submission_id', requireAuth, attachDecisionScope, makeDecision);

export default r;
