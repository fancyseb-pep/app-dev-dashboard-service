// src/index.js
// Express entry point.
// Loads env → validates config → mounts routes → starts server.

import "dotenv/config";
import express from "express";
import cors from "cors";
import { validateEnv } from "./config/env.js";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Fail fast on missing config
validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-api-key"],
  })
);
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", routes);

// ── Central error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Backend running on http://localhost:${PORT}`);
  console.log(`[server] Databricks host: ${process.env.DATABRICKS_HOST}`);
});
