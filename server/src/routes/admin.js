// server/src/routes/admin.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { appDb } from '../db/pool.js';
import bcrypt from 'bcrypt';
import { cleanText, isEmail, isStrongPassword } from '../utils/validators.js';
import { standardLimiter } from '../middleware/rateLimiter.js';
import { logSecurityEvent } from '../utils/logSecurityEvent.js';

const r = Router();
const ROLES = new Set(['author','reviewer','chair','decision_maker','admin']);
const SCOPABLE = new Set(['reviewer','decision_maker']);

function normCats(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map(s => String(s || '').trim().toUpperCase()).filter(Boolean))];
}

/**
 * GET /admin/categories
 */
r.get('/categories', requireAuth, requireRole('admin'), async (_req, res) => {
  const q = await appDb.query(`SELECT id, label FROM categories ORDER BY id`);
  res.json({ items: q.rows });
});

/**
 * GET /admin/users?role=&q=&page=&limit=
 * Includes reviewer/decision_maker category arrays.
 */
r.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const role = cleanText(req.query.role, { max: 32 });
  const qstr = cleanText(req.query.q, { max: 80 });
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const offset = (page - 1) * limit;

  const params = [];
  const where = [];

  if (role && ROLES.has(role)) {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }
  if (qstr) {
    params.push(`%${qstr.toLowerCase()}%`);
    const i = params.length;
    where.push(`(LOWER(u.email) LIKE $${i} OR LOWER(u.name) LIKE $${i})`);
  }
  params.push(limit, offset);

  const sql = `
    SELECT
      u.id, u.email, u.name, u.role, u.is_active, u.created_at,
      COALESCE(rc.cats, '{}') AS reviewer_categories,
      COALESCE(dm.cats, '{}') AS decision_categories
    FROM users u
    LEFT JOIN (
      SELECT user_id, array_agg(category_id ORDER BY category_id) AS cats
      FROM user_categories WHERE role_scope='reviewer' GROUP BY user_id
    ) rc ON rc.user_id = u.id
    LEFT JOIN (
      SELECT user_id, array_agg(category_id ORDER BY category_id) AS cats
      FROM user_categories WHERE role_scope='decision_maker' GROUP BY user_id
    ) dm ON dm.user_id = u.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY u.created_at DESC
    LIMIT $${params.length-1} OFFSET $${params.length}
  `;
  const out = await appDb.query(sql, params);
  res.json({ items: out.rows, page, limit });
});

/**
 * POST /admin/users
 * Body: { email, name, password, role, categories?: [A,B,...] }
 */
r.post('/users', requireAuth, requireRole('admin'), standardLimiter, async (req, res) => {
  const traceId = `ADM-CRT-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const email = isEmail(req.body?.email);
  const name = cleanText(req.body?.name, { max: 80 });
  const role = cleanText(req.body?.role, { max: 32 }).toLowerCase();
  const password = String(req.body?.password || '');
  const cats = SCOPABLE.has(role) ? normCats(req.body?.categories) : [];

  if (!email || !name || !isStrongPassword(password) || !ROLES.has(role)) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (SCOPABLE.has(role) && cats.length === 0) {
    return res.status(400).json({ error: 'Categories required for reviewer/decision_maker' });
  }

  const exist = await appDb.query('SELECT 1 FROM users WHERE LOWER(email)=$1', [email]);
  if (exist.rowCount) return res.status(400).json({ error: 'User exists' });

  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  const hash = await bcrypt.hash(password, rounds);

  try {
    await appDb.query('BEGIN');

    const ins = await appDb.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1,$2,$3,$4)
       RETURNING id, email, name, role, is_active, created_at`,
      [email, hash, name, role]
    );
    const user = ins.rows[0];

    if (cats.length) {
      const chk = await appDb.query(`SELECT id FROM categories WHERE id = ANY($1::text[])`, [cats]);
      const valid = new Set(chk.rows.map(r => r.id));
      for (const c of cats) {
        if (!valid.has(c)) continue;
        await appDb.query(
          `INSERT INTO user_categories (user_id, category_id, role_scope)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [user.id, c, role] // role is 'reviewer' or 'decision_maker'
        );
      }
    }

    await appDb.query('COMMIT');

    await logSecurityEvent({
      traceId, actorUserId: req.user.uid, action: 'admin.user_create', severity: 'info',
      details: { user_id: ins.rows[0].id, role, cats, email },
      ip, userAgent
    });

    res.json({ ok: true, user: ins.rows[0] });
  } catch (e) {
    await appDb.query('ROLLBACK');
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /admin/users/:id/categories
 * Body: { role_scope: 'reviewer'|'decision_maker', categories: [A,B,...] }
 */
r.post('/users/:id/categories', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id || 0);
  const roleScope = cleanText(req.body?.role_scope, { max: 32 }).toLowerCase();
  const cats = normCats(req.body?.categories);

  if (!userId || !SCOPABLE.has(roleScope) || cats.length === 0) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const uq = await appDb.query(`SELECT id, role FROM users WHERE id=$1`, [userId]);
  const u = uq.rows[0];
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.role !== roleScope) return res.status(400).json({ error: 'User role mismatch' });

  try {
    await appDb.query('BEGIN');
    await appDb.query(`DELETE FROM user_categories WHERE user_id=$1 AND role_scope=$2`, [userId, roleScope]);

    const chk = await appDb.query(`SELECT id FROM categories WHERE id = ANY($1::text[])`, [cats]);
    const valid = new Set(chk.rows.map(r => r.id));

    for (const c of cats) {
      if (!valid.has(c)) continue;
      await appDb.query(
        `INSERT INTO user_categories (user_id, category_id, role_scope)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [userId, c, roleScope]
      );
    }
    await appDb.query('COMMIT');

    res.json({ ok: true, user_id: userId, role_scope: roleScope, categories: cats });
  } catch (e) {
    await appDb.query('ROLLBACK');
    return res.status(500).json({ error: 'Server error' });
  }
});

export default r;
