// server/src/middleware/requireRole.js

/**
 * Role check — simple gate by role.
 * - 'chair' is GLOBAL (no category scoping).
 * - 'reviewer' and 'decision_maker' are category-scoped (enforced by helper below).
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

/**
 * Enforce category scoping for specific roles (reviewer, decision_maker).
 * Chair is global, so this should NOT be applied to 'chair'.
 *
 * Use in routes where a category context exists in params/body/query.
 * Defaults to reading `category_id` from params -> body -> query.
 */
export function requireScopedCategory({ param = 'category_id', roles = ['reviewer', 'decision_maker'] } = {}) {
  return (req, res, next) => {
    const cat =
      (req.params && req.params[param]) ||
      (req.body && req.body[param]) ||
      (req.query && req.query[param]);

    // No category found -> cannot enforce scope
    if (!cat) return res.status(400).json({ error: 'Category required' });

    // If role isn't in scoped roles, skip (e.g., chair/admin)
    if (!req.user || !roles.includes(req.user.role)) return next();

    const allowed = Array.isArray(req.user.categories) ? req.user.categories : [];
    if (!allowed.includes(cat)) {
      return res.status(403).json({ error: 'Forbidden: category scope' });
    }
    next();
  };
}
