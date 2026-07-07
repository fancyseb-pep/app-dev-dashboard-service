// src/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { validateEnv } from "./config/env.js";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { closeSession } from "./services/databricks.js";
import chatbotRouter from "./routes/chatbot.js";

// Fail fast on missing config
validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────────────────────────
// FRONTEND_ORIGIN can be a single URL or a comma-separated list.
const rawOrigins = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const allowedOrigins = rawOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-api-key"],
  })
);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.use("/api/chatbot", chatbotRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    env: process.env.NODE_ENV || "development",
    databricksHost: process.env.DATABRICKS_HOST,
    allowedOrigins,
  })
);

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", routes);

// ── Central error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[server] Backend running on http://localhost:${PORT}`);
  console.log(`[server] NODE_ENV: ${process.env.NODE_ENV || "development"}`);
  console.log(`[server] Databricks host: ${process.env.DATABRICKS_HOST}`);
  console.log(`[server] Allowed CORS origins: ${allowedOrigins.join(", ")}`);
});

// Graceful shutdown — close HTTP server and Databricks session
async function shutdown(signal) {
  console.log(`[server] Received ${signal}. Shutting down...`);
  try {
    server.close(() => console.log('[server] HTTP server closed'));
    await closeSession();
  } catch (e) {
    console.error('[server] Error during shutdown:', e);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught Exception:', err);
  // It's safer to exit; let the process manager restart the app
  process.exit(1);
});