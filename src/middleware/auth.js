// src/middleware/auth.js

import crypto from "crypto";

export function auth(req, res, next) {
  const secret = process.env.API_SECRET_KEY;

  // No key configured — skip auth entirely.
  // In production on BTP, always set API_SECRET_KEY via `cf set-env`.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[auth] WARNING: API_SECRET_KEY not set — API is running without x-api-key protection.",
      );
    }
    return next();
  }

  // On Cloud Foundry, VCAP_SERVICES is always injected by the platform.
  // Locally it is never present, so we can use it as a reliable CF detector.
  // This means: even if API_SECRET_KEY is set in your local .env for other
  // reasons, auth is still skipped locally so you can hit the backend directly.
  const isCloudFoundry = !!process.env.VCAP_SERVICES;
  if (!isCloudFoundry) {
    console.log(
      `[auth] Local dev detected (no VCAP_SERVICES) — skipping x-api-key check for ${req.method} ${req.path}`,
    );
    return next();
  }

  const key = req.headers["x-api-key"] || "";
  try {
    const a = Buffer.from(String(key));
    const b = Buffer.from(String(secret));

    // Buffers must be the same length for timingSafeEqual.
    // Compare against a dummy buffer first to avoid timing leaks.
    if (a.length !== b.length) {
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
