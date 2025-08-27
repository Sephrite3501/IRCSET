import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { standardLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as Admin from '../controllers/adminController.js';
import { validateParamId } from '../utils/validators.js';

const r = Router();

// Mounted at /admin in app.js

// Reads
r.get('/categories', requireAuth, requireRole('admin'), asyncHandler(Admin.listCategories));
r.get('/users',      requireAuth, requireRole('admin'), asyncHandler(Admin.listUsers));

// Writes
r.post('/users',
  requireAuth, requireRole('admin'), standardLimiter,
  asyncHandler(Admin.createUser)
);

r.post('/users/:id/categories',
  requireAuth, requireRole('admin'), validateParamId('id'),
  asyncHandler(Admin.setUserCategories)
);

export default r;
