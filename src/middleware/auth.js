// src/middleware/auth.js

function getAllowedOrigins() {
  return (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function auth(req, res, next) {
  const origin = req.headers.origin;

  // Non-browser / same-origin requests don't send Origin.
  if (!origin) return next();

  if (getAllowedOrigins().includes(origin)) return next();

  console.warn(`[auth] Blocked request from disallowed origin: ${origin}`);
  return res.status(403).json({ error: "Forbidden" });
}
