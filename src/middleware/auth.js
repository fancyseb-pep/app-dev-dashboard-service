// src/middleware/auth.js
// Simple API key guard for all /api/* routes.
// The frontend sends this key in the x-api-key header.
// Set API_SECRET_KEY in .env — if not set, auth is skipped
// in development so local dev works without config overhead.

export function auth(req, res, next) {
  const secret = process.env.API_SECRET_KEY;

  // If no secret is configured, allow all requests (dev mode)
  if (!secret) return next();

  const key = req.headers["x-api-key"];
  if (key !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
