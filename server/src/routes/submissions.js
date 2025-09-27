import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { uploadPdf, ensurePdfMagic } from '../middleware/uploadPdf.js';
import { validateParamId } from '../utils/validators.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import {
  createSubmission,
  listMySubmissions,
  getMySubmission,
} from '../controllers/submissionsController.js';

import { listReviewsForAuthor } from '../controllers/reviewsReadController.js';

const r = Router();

// POST /submissions/:eventId (multipart/form-data, field: pdf)
r.post(
  '/:eventId',
  requireAuth,
  writeLimiter,
  uploadPdf.single('pdf'),
  ensurePdfMagic,
  createSubmission
);

// GET /submissions/:eventId/mine
r.get(
  '/:eventId/mine',
  requireAuth,
  listMySubmissions
);

// GET /submissions/:eventId/:id
r.get(
  '/:eventId/:id',
  requireAuth,
  validateParamId('id'),
  getMySubmission
);


r.get('/:eventId/:id/reviews',
  requireAuth,
  validateParamId('id'),
  listReviewsForAuthor
);

export default r;
