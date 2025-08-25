// server/src/routes/finalRoutes.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import requireAuth from '../middleware/requireAuth.js';
import { uploadFinal } from '../controllers/finalController.js';

const r = Router();

// Separate storage for final PDFs (uploads/final)
const finalDir = 'uploads/final';
if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, finalDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const uploadFinalPdf = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const okMime = file.mimetype === 'application/pdf';
    const okExt = path.extname(file.originalname).toLowerCase() === '.pdf';
    if (!okMime || !okExt) return cb(new Error('PDF only'));
    cb(null, true);
  }
});

// POST /submissions/:id/final
r.post('/submissions/:id/final', requireAuth, uploadFinalPdf.single('pdf'), uploadFinal);

// Nice error responses for multer/file filter errors on this router
r.use((err, _req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'PDF too large' });
  if (err?.message === 'PDF only')     return res.status(400).json({ error: 'PDF only' });
  return next(err);
});

export default r;
