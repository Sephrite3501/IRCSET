// server/src/utils/validators.js
import sanitizeHtml from 'sanitize-html';

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
