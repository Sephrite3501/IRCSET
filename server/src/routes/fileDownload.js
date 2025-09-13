// server/src/routes/fileDownload.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { getFinalPdf } from '../controllers/fileDownloadController.js';
import { validateParamId } from '../utils/validators.js';

const r = Router();

// Pattern A (events-first)
r.get(
  '/events/:eventId/submissions/:id/final.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getFinalPdf
);

// Pattern B (submissions-first) — matches your upload style
r.get(
  '/submissions/:eventId/:id/final.pdf',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  getFinalPdf
);

export default r;
