import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { getFinalPdf } from '../controllers/fileDownloadController.js';

const r = Router();

// keep exact path: /submissions/:id/final.pdf
r.get('/submissions/:id/final.pdf', requireAuth, getFinalPdf);

export default r;
