// src/middleware/auth.js
// Simple API key guard for all /api/* routes.
// The frontend sends this key in the x-api-key header.
// Set API_SECRET_KEY in .env — if not set, auth is skipped
// in development so local dev works without config overhead.

import crypto from "crypto";

export function auth(req, res, next) {
  const secret = process.env.API_SECRET_KEY;

  // If no secret is configured and we're not in production, allow all requests (dev mode)
  if (!secret && process.env.NODE_ENV !== "production") return next();

  // In production, secret MUST be set (enforced at startup). If missing for any
  // reason, deny access.
  if (!secret) return res.status(401).json({ error: "Unauthorized" });

  const key = req.headers["x-api-key"] || "";
  try {
    const a = Buffer.from(String(key));
    const b = Buffer.from(String(secret));
    // Ensure buffers are same length for timingSafeEqual
    if (a.length !== b.length) {
      // Create a dummy buffer to compare to avoid leaking timing info
      const dummy = Buffer.alloc(b.length);
      crypto.timingSafeEqual(dummy, b);
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
