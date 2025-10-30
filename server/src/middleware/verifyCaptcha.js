// server/src/middleware/verifyCaptcha.js
export async function verifyCaptcha(req, res, next) {
  try {
    // accept multiple keys + header
    const token =
      req.body?.captchaToken ||
      req.body?.token ||
      req.body?.['g-recaptcha-response'] ||
      req.headers['x-captcha-token'];

    if (!token) {
      // TEMP log to pinpoint why it's missing
      console.warn(
        "[verifyCaptcha] missing token",
        "ctype:", req.headers['content-type'],
        "bodyKeys:", req.body ? Object.keys(req.body) : null,
        "hasHeader:", Boolean(req.headers['x-captcha-token'])
      );
      return res.status(400).json({ error: "CAPTCHA token missing" });
    }

    const secret = process.env.RECAPTCHA_SECRET;
    if (!secret) return res.status(500).json({ error: "Server missing RECAPTCHA_SECRET" });

    const body = new URLSearchParams({ secret, response: token });
    const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await resp.json();

    if (!data.success) {
      console.warn("[verifyCaptcha] verify failed:", data);
      return res.status(403).json({ error: "captcha failed", data });
    }

    const min = Number(process.env.RECAPTCHA_MIN_SCORE || NaN);
    if (!Number.isNaN(min) && typeof data.score === "number" && data.score < min) {
      return res.status(403).json({ error: "captcha score too low", score: data.score });
    }

    next();
  } catch (err) {
    console.error("verifyCaptcha error:", err);
    res.status(500).json({ error: "captcha verification error" });
  }
}
