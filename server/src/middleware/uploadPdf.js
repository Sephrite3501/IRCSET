// server/src/middleware/uploadPdf.js
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';

const uploadDir = 'uploads';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, _file, cb) => cb(null, randomUUID() + '.pdf')
});

// be generous with declared MIME; we’ll enforce magic bytes after save
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream'
]);

function hasPdfExt(name) {
  return path.extname(name || '').toLowerCase() === '.pdf';
}

export const uploadPdf = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const okExt = hasPdfExt(file.originalname);
    const okMime = ALLOWED_MIME.has((file.mimetype || '').toLowerCase());
    if (!okExt || !okMime) {
      return cb(new Error('PDF only'));
    }
    cb(null, true);
  }
});

/**
 * After Multer writes to disk, verify magic bytes: PDF must start with "%PDF-"
 * If not, delete file and 400.
 */
export async function ensurePdfMagic(req, res, next) {
  try {
    if (!req.file?.path) {
      return res.status(400).json({ error: 'PDF required' });
    }
    const fh = await fs.open(req.file.path, 'r');
    const { buffer } = await fh.read({ buffer: Buffer.alloc(5), position: 0, length: 5 });
    await fh.close();
    const sig = buffer.toString('utf8');
    if (!sig.startsWith('%PDF-')) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'PDF only' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
