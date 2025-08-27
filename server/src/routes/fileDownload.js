import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { getFinalPdf } from '../controllers/fileDownloadController.js';
import { validateParamId } from '../utils/validators.js';

const r = Router();

// Exact path: /submissions/:id/final.pdf  (router is mounted at app root)
r.get('/submissions/:id/final.pdf',
  requireAuth, validateParamId('id'),
  getFinalPdf
);

export default r;
