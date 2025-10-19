// server/src/utils/validators.js
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';

export function cleanText(s, { max = 200 } = {}) {
  const x = String(s || '').trim();
  const stripped = sanitizeHtml(x, { allowedTags: [], allowedAttributes: {} });
  return stripped.slice(0, max);
}

export function isEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  // simple strict-enough regex + length caps
  const ok = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e) && e.length <= 254;
  return ok ? e : null;
}

export function isStrongPassword(pw) {
  // ≥8 chars, include letters + numbers; adjust as needed
  return typeof pw === 'string' && pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}


export const validateParamId = (name='id') => (req, res, next) => {
  const schema = z.coerce.number().int().positive();
  const r = schema.safeParse(req.params[name]);
  if (!r.success) return res.status(400).json({ error: `${name} must be a positive integer`});
  req.params[name] = r.data;
  next();
};

export const validateDecisionBody = (req, res, next) => {
  const schema = z.object({
    decision: z.enum(['accept','reject']),
    note: z.string().max(2000).optional()
  });
  const r = schema.safeParse(req.body);
  if (!r.success) return res.status(400).json({ error: 'Invalid body', details: r.error.flatten()});
  next();
};

/** Chair assign/unassign body:
 *  Accepts either { reviewers: number[] } or { reviewer_ids: number[] }.
 *  Coerces strings -> numbers, enforces uniqueness and small bounds.
 *  Normalizes to req.body.reviewers = number[].
 */
export const validateAssignBody = (req, res, next) => {
  const base = z.object({
    reviewers: z.preprocess(
      (v) => (v ?? req.body?.reviewer_ids), // fallback alias
      z.array(z.coerce.number().int().positive()).min(1).max(10)
    )
  });

  const r = base.safeParse(req.body);
  if (!r.success) {
    return res.status(400).json({ error: 'Invalid reviewers payload', details: r.error.flatten() });
  }

  // enforce uniqueness
  const uniq = Array.from(new Set(r.data.reviewers));
  if (uniq.length !== r.data.reviewers.length) {
    return res.status(400).json({ error: 'Duplicate reviewer IDs not allowed' });
  }

  req.body.reviewers = uniq;
  next();
};

/** Reviewer submit review body:
 *  { rating: 1..5, comment?: string<=2000 (sanitized) }
 *  Normalizes req.body.comment (stripped + trimmed).
 */
export const validateReviewBody = (req, res, next) => {
  const schema = z.object({
    score_technical: z.coerce.number().int().min(1).max(5),
    score_relevance: z.coerce.number().int().min(1).max(5),
    score_innovation: z.coerce.number().int().min(1).max(5),
    score_writing: z.coerce.number().int().min(1).max(5),
    comments_for_author: z.string().max(5000).optional().nullable(),
    comments_committee: z.string().max(5000).optional().nullable(),
  });

  const r = schema.safeParse(req.body);
  if (!r.success) {
    return res
      .status(400)
      .json({ error: 'Invalid review body', details: r.error.flatten() });
  }

  // sanitize
  req.body.comments_for_author = r.data.comments_for_author
    ? sanitizeHtml(r.data.comments_for_author, { allowedTags: [], allowedAttributes: {} }).trim() || null
    : null;
  req.body.comments_committee = r.data.comments_committee
    ? sanitizeHtml(r.data.comments_committee, { allowedTags: [], allowedAttributes: {} }).trim() || null
    : null;

  next();
};
