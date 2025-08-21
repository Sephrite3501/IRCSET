// src/middleware/csrf.js
import crypto from "crypto";

/**
 * Issues a CSRF token cookie if missing.
 * Cookie is NOT httpOnly (so the client can read it) but is SameSite=Lax.
 * Header name required on writes: X-CSRF-Token
 */
export function issueCsrf(req, res, next) {
  // if already set, keep it
  if (req.cookies && req.cookies["csrf-token"]) return next();
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie("csrf-token", token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  next();
}

/**
 * Require double-submit CSRF on state-changing routes.
 * Compares header X-CSRF-Token with cookie csrf-token.
 */
export function requireCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  const header = req.get("X-CSRF-Token");
  const cookie = req.cookies ? req.cookies["csrf-token"] : undefined;

  if (!header || !cookie || header !== cookie) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  next();
}
