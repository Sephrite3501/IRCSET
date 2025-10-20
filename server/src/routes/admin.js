// server/src/routes/admin.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { standardLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as Admin from '../controllers/adminController.js';
import { validateParamId } from '../utils/validators.js';

const r = Router();

// Mounted at /admin in app.js

// Middleware: must be admin
function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

r.get(
  '/users',
  requireAuth, requireAdmin,
  asyncHandler(Admin.listAllUsers)
);

// Event management
r.post('/events',
  requireAuth, requireAdmin, standardLimiter,
  asyncHandler(Admin.createEvent)
);

r.post('/events/:eventId/assign',
  requireAuth, requireAdmin, validateParamId('eventId'),
  asyncHandler(Admin.assignEventRole)
);

r.delete('/events/:eventId/assign',
  requireAuth, requireAdmin, validateParamId('eventId'),
  asyncHandler(Admin.unassignEventRole)
);


r.get('/events',
  requireAuth, requireAdmin,
  asyncHandler(Admin.listEvents)
);

r.get('/events/:eventId/users',
  requireAuth, requireAdmin, validateParamId('eventId'),
  asyncHandler(Admin.listEventUsers)
);


// Lock or unlock user (soft lock)
r.post('/users/:userId/lock',
  requireAuth, requireAdmin, validateParamId('userId'),
  asyncHandler(Admin.lockUser)
);

r.post('/users/:userId/unlock',
  requireAuth, requireAdmin, validateParamId('userId'),
  asyncHandler(Admin.unlockUser)
);

// Update user (name/email)
r.put('/users/:userId',
  requireAuth, requireAdmin, validateParamId('userId'),
  asyncHandler(Admin.updateUser)
);

// Update user role (admin privilege)
r.put('/users/:userId/role',
  requireAuth, requireAdmin, validateParamId('userId'),
  asyncHandler(Admin.updateUserRole)
);
export default r;
