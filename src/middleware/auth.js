// src/middleware/auth.js

import crypto from "crypto";

export function auth(req, res, next) {
  const secret = process.env.API_SECRET_KEY;

 
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[auth] WARNING: API_SECRET_KEY not set — API is running without x-api-key protection.");
    }
    return next();
  }

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
