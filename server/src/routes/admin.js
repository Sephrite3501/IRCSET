import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { standardLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as Admin from '../controllers/adminController.js';

const r = Router();

// mounted at /admin in app.js
r.get('/categories', requireAuth, requireRole('admin'), asyncHandler(Admin.listCategories));
r.get('/users',      requireAuth, requireRole('admin'), asyncHandler(Admin.listUsers));
r.post('/users',     requireAuth, requireRole('admin'), standardLimiter, asyncHandler(Admin.createUser));
r.post('/users/:id/categories', requireAuth, requireRole('admin'), asyncHandler(Admin.setUserCategories));

export default r;
