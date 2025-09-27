import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { getInitialPdf, getFinalPdf } from '../controllers/fileDownloadController.js';
import { validateParamId } from '../utils/validators.js';

const r = Router();

/* -------- Events-first patterns -------- */
r.get(
  '/events/:eventId/submissions/:id/initial.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getInitialPdf
);

r.get(
  '/events/:eventId/submissions/:id/final.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getFinalPdf
);

/* -------- Submissions-first patterns (your other style) -------- */
r.get(
  '/submissions/:eventId/:id/initial.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getInitialPdf
);

r.get(
  '/submissions/:eventId/:id/final.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getFinalPdf
);

export default r;
