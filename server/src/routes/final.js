import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import requireAuth from '../middleware/requireAuth.js';
import { uploadFinal } from '../controllers/finalController.js';
import { validateParamId } from '../utils/validators.js';
import { ensurePdfMagic } from '../middleware/uploadPdf.js';

const r = Router();

const finalDir = path.resolve(process.cwd(), 'uploads/final');
if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, finalDir),
  filename: (_req, _file, cb) =>
    cb(null, `tmp_${Date.now()}_${Math.round(Math.random() * 1e9)}.pdf`)
});

const uploadFinalPdf = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okExt = path.extname(file.originalname).toLowerCase() === '.pdf';
    const okMime = ['application/pdf','application/x-pdf','application/octet-stream']
      .includes((file.mimetype || '').toLowerCase());
    if (!okExt || !okMime) return cb(new Error('PDF only'));
    cb(null, true);
  }
});

// POST /submissions/:eventId/:id/final
r.post(
  '/:eventId/:id/final',
  requireAuth,
  validateParamId('id'),
  uploadFinalPdf.single('pdf'),
  ensurePdfMagic,
  uploadFinal
);

r.use((err, _req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'PDF too large' });
  }
  if (err?.message === 'PDF only') {
    return res.status(400).json({ error: 'PDF only' });
  }
  return next(err);
});

export default r;
