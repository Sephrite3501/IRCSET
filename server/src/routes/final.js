// server/src/routes/final.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import requireAuth from '../middleware/requireAuth.js';
import { uploadFinal } from '../controllers/finalController.js';
import { validateParamId } from '../utils/validators.js';
import { ensurePdfMagic } from '../middleware/uploadPdf.js';

const r = Router();

const finalDir = 'uploads/final';
if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream'
]);

function hasPdfExt(name) {
  return path.extname(name || '').toLowerCase() === '.pdf';
}

// store to uploads/final with a TEMP random name; controller will rename to final_<draftUuid>.pdf
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, finalDir),
  filename: (_req, _file, cb) => cb(null, `tmp_${Date.now()}_${Math.round(Math.random()*1e9)}.pdf`)
});

const uploadFinalPdf = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const okExt = hasPdfExt(file.originalname);
    const okMime = ALLOWED_MIME.has((file.mimetype || '').toLowerCase());
    if (!okExt || !okMime) return cb(new Error('PDF only'));
    cb(null, true);
  }
});

// POST /submissions/:id/final
r.post('/:id/final',
  requireAuth,
  validateParamId('id'),
  uploadFinalPdf.single('pdf'),
  ensurePdfMagic,
  uploadFinal
);

// Multer error shaping for this router
r.use((err, _req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'PDF too large' });
  if (err?.message === 'PDF only')     return res.status(400).json({ error: 'PDF only' });
  return next(err);
});

export default r;
