// src/middleware/errorHandler.js
// Central Express error handler. Catches anything passed to next(err).
// Logs the full stack in development, returns a clean JSON error to client.

export function errorHandler(err, req, res, _next) {
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  res.status(status).json({ error: message });
}
