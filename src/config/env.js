// src/config/env.js
// Validates all required environment variables on startup.
// Throws immediately if anything is missing so you catch config
// problems at boot rather than at the first API call.

const REQUIRED = [
  "DATABRICKS_HOST",
  "DATABRICKS_HTTP_PATH",
  "DATABRICKS_TOKEN",
];

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(", ")}\n` +
        `Check your .env file against .env.example`
    );
  }
}
