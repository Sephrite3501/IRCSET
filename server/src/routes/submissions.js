// server/src/routes/submissionsRoutes.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { uploadPdf } from '../middleware/uploadPdf.js';
import {
  createSubmission,
  listMySubmissions,
  getMySubmission,
} from '../controllers/submissionsController.js';

const r = Router();

// POST /submissions (multipart/form-data)
r.post('/submissions', requireAuth, uploadPdf.single('pdf'), createSubmission);

// GET /submissions/mine
r.get('/submissions/mine', requireAuth, listMySubmissions);

// GET /submissions/:id
r.get('/submissions/:id', requireAuth, getMySubmission);

export default r;
