// server/src/middleware/uploadPdf.js
import multer from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, randomUUID() + '.pdf')
});

function isPdf(file) {
  const okMime = file.mimetype === 'application/pdf';
  const okName = path.extname(file.originalname).toLowerCase() === '.pdf';
  return okMime && okName;
}

export const uploadPdf = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!isPdf(file)) return cb(new Error('PDF only'));
    cb(null, true);
  }
});
