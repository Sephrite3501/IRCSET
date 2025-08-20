// server/src/routes/admin.js
import { Router } from 'express';
import requireAuth from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { appDb } from '../db/pool.js';
import bcrypt from 'bcrypt';
import { cleanText, isEmail, isStrongPassword } from '../utils/validators.js';

const r = Router();

/**
 * GET /admin/users
 * List users (basic)
 */
r.get('/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  const q = await appDb.query(
    `SELECT id, email, name, role, is_active, created_at
       FROM users
      ORDER BY id ASC`
  );
  res.json({ items: q.rows });
});

/**
 * POST /admin/users
 * Create user with role: reviewer | decision_maker | chair
 * body: { email, name, password, role, categories?: ['A','B'...] }
 * - categories required for reviewer/decision_maker, ignored for chair
 */
r.post('/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  const email = isEmail(req.body?.email);
  const name = cleanText(req.body?.name, { max: 80 });
  const role = cleanText(req.body?.role, { max: 32 }).toLowerCase();
  const password = String(req.body?.password || '');
  const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];

  if (!email || !name || !['reviewer','decision_maker','chair'].includes(role) || !isStrongPassword(password)) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if ((role === 'reviewer' || role === 'decision_maker') && categories.length === 0) {
    return res.status(400).json({ error: 'Categories required for reviewer/decision_maker' });
  }

  // ensure user not exists
  const exists = await appDb.query('SELECT 1 FROM users WHERE LOWER(email)=$1', [email]);
  if (exists.rowCount) return res.status(400).json({ error: 'User exists' });

  const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 10));
  const ins = await appDb.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1,$2,$3,$4) RETURNING id, email, name, role`,
    [email, hash, name, role]
  );
  const user = ins.rows[0];

  // attach categories if reviewer/decision_maker
  if (role === 'reviewer' || role === 'decision_maker') {
    // validate categories exist
    const catRows = await appDb.query('SELECT id FROM categories WHERE id = ANY($1::text[])', [categories]);
    const have = new Set(catRows.rows.map(r => r.id));
    const toInsert = categories.filter(c => have.has(c));
    for (const c of toInsert) {
      await appDb.query(
        `INSERT INTO user_categories (user_id, category_id, role_scope)
         VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [user.id, c, role]
      );
    }
  }

  res.json({ ok: true, user });
});

/**
 * POST /admin/users/:id/categories
 * Set category scopes for reviewer/decision_maker
 * body: { role_scope: 'reviewer' | 'decision_maker', categories: ['A','B',...] }
 */
r.post('/admin/users/:id/categories', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id || 0);
  const roleScope = cleanText(req.body?.role_scope, { max: 32 }).toLowerCase();
  const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];
  if (!userId || !['reviewer','decision_maker'].includes(roleScope) || categories.length === 0) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // ensure user + role matches
  const uq = await appDb.query('SELECT id, role FROM users WHERE id=$1', [userId]);
  const u = uq.rows[0];
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.role !== roleScope) return res.status(400).json({ error: 'User role mismatch' });

  // clear old scopes for that role
  await appDb.query('DELETE FROM user_categories WHERE user_id=$1 AND role_scope=$2', [userId, roleScope]);

  // validate categories exist
  const catRows = await appDb.query('SELECT id FROM categories WHERE id = ANY($1::text[])', [categories]);
  const have = new Set(catRows.rows.map(r => r.id));
  const toInsert = categories.filter(c => have.has(c));

  for (const c of toInsert) {
    await appDb.query(
      `INSERT INTO user_categories (user_id, category_id, role_scope)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [userId, c, roleScope]
    );
  }
  res.json({ ok: true, user_id: userId, role_scope: roleScope, categories: toInsert });
});

/**
 * GET /admin/categories
 * List categories
 */
r.get('/admin/categories', requireAuth, requireRole('admin'), async (req, res) => {
  const q = await appDb.query('SELECT id, label FROM categories ORDER BY id');
  res.json({ items: q.rows });
});

/**
 * POST /admin/categories
 * Rename labels for A–E
 * body: [{ id:'A', label:'Networking' }, ...]
 */
r.post('/admin/categories', requireAuth, requireRole('admin'), async (req, res) => {
  const arr = Array.isArray(req.body) ? req.body : [];
  for (const it of arr) {
    const id = cleanText(it.id, { max: 1 }).toUpperCase();
    const label = cleanText(it.label, { max: 64 });
    if (!id || !label) continue;
    await appDb.query('UPDATE categories SET label=$1 WHERE id=$2', [label, id]);
  }
  res.json({ ok: true });
});

export default r;
