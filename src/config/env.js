// src/config/env.js
// Validates required environment variables on startup.
// Throws immediately if anything is missing so config problems
// surface at boot rather than at the first API call.

const REQUIRED = [
  "DATABRICKS_HOST",
  "DATABRICKS_HTTP_PATH",
  "DATABRICKS_TOKEN",
  "GEMINI_API_KEY",
];

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(", ")}\n` +
        `Copy .env.example to .env and fill in the missing values.`
    );
  }

  if (process.env.NODE_ENV === "production") {
    const requiredInProd = ["FRONTEND_ORIGIN"];
    const missingProd = requiredInProd.filter((k) => !process.env[k]);
    if (missingProd.length) {
      throw new Error(
        `[env] Missing required production environment variables: ${missingProd.join(", ")}. ` +
          `Set these in your App Service / CF configuration.`
      );
    }

    if (!process.env.API_SECRET_KEY) {
      console.warn("[env] WARNING: API_SECRET_KEY not set — API will run without x-api-key protection.");
    }
  }

  // Warn (don't crash) on other missing optional-but-recommended vars in non-prod
  if (process.env.NODE_ENV !== "production") {
    const recommended = [];
    const missingRec = recommended.filter((k) => !process.env[k]);
    if (missingRec.length) {
      console.warn(
        `[env] WARNING: recommended vars not set: ${missingRec.join(", ")}`
      );
    }
  }
}
