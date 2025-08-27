// Mounted at /submissions in app.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { uploadPdf, ensurePdfMagic  } from '../middleware/uploadPdf.js';
import { validateParamId } from '../utils/validators.js';
import {
  createSubmission,
  listMySubmissions,
  getMySubmission,
} from '../controllers/submissionsController.js';
import { writeLimiter } from '../middleware/rateLimiter.js';

const r = Router();

// POST /submissions  (multipart/form-data, field: pdf)
r.post('/',
  requireAuth, writeLimiter,
  uploadPdf.single('pdf'), ensurePdfMagic,
  createSubmission
);

// GET /submissions/mine
r.get('/mine', requireAuth, listMySubmissions);

// GET /submissions/:id
r.get('/:id',
  requireAuth, validateParamId('id'),
  getMySubmission
);

export default r;
