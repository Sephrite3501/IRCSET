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

// ---- helpers: make sure uploads/events/:eventId/final exists ----
const ensureEventFinalDir = (eventId) => {
  const dir = path.resolve(process.cwd(), 'uploads', 'events', String(eventId), 'final');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// ---- multer storage: per-event final folder ----
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const eventId = Number(req.params.eventId || 0);
    const target = eventId
      ? ensureEventFinalDir(eventId)
      // very defensive fallback; should not happen because eventId is validated
      : path.resolve(process.cwd(), 'uploads', 'events', 'unknown', 'final');
    cb(null, target);
  },
  filename: (_req, _file, cb) =>
    cb(null, `tmp_${Date.now()}_${Math.round(Math.random() * 1e9)}.pdf`)
});

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream'
]);

const uploadFinalPdf = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const okExt = path.extname(file.originalname || '').toLowerCase() === '.pdf';
    const okMime = ALLOWED_MIME.has((file.mimetype || '').toLowerCase());
    if (!okExt || !okMime) return cb(new Error('PDF only'));
    cb(null, true);
  }
});

// POST /submissions/:eventId/:id/final  (multipart/form-data; field: pdf)
r.post(
  '/:eventId/:id/final',
  requireAuth,
  validateParamId('eventId'),
  validateParamId('id'),
  uploadFinalPdf.single('pdf'),
  ensurePdfMagic,
  uploadFinal
);

// Multer error shaping
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
