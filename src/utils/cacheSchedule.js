/**
 * cacheSchedule.js
 *
 * Computes cache expiry times aligned to the Databricks refresh schedule.
 *
 * Databricks refreshes at these CST times:
 *   05:10, 13:10, 21:10  (CST = UTC-6)
 *
 * In UTC those are:
 *   11:10, 19:10, 03:10 (next day)
 *
 * ── Azure multi-instance note ─────────────────────────────────────────────────
 * This cache is IN-PROCESS (a JavaScript Map in memory). Each Azure App Service
 * instance has its own independent copy. This is intentional and safe because:
 *
 *   1. All instances compute the SAME expiry time (schedule-aligned, UTC-based).
 *   2. A cache miss just queries Databricks — no consistency problem.
 *   3. Databricks data itself is the source of truth; the cache only reduces
 *      redundant queries to it.
 *
 * If you want cross-instance cache sharing, configure Azure Cache for Redis and
 * replace dbCacheGet/dbCacheSet in routes/operations.js with a Redis client.
 * Set REDIS_URL in your App Service application settings and uncomment the
 * Redis section in this file.
 *
 * For most deployments, single-instance or small-scale Azure App Service plans,
 * the in-process cache is perfectly adequate.
 */

// ── Config ────────────────────────────────────────────────────────────────────

// Databricks refresh times expressed as [hour, minute] in CST (UTC-6)
const REFRESH_TIMES_CST = [
  [5, 10],   // 05:10 CST → 11:10 UTC
  [13, 10],  // 13:10 CST → 19:10 UTC
  [21, 10],  // 21:10 CST → 03:10 UTC next day
];

// How many minutes after the refresh time before we re-query Databricks.
// Gives the ETL job time to finish writing before we read.
const BUFFER_MINUTES = parseInt(process.env.CACHE_BUFFER_MINUTES ?? "5", 10);

// CST offset from UTC. Change to -5 if Databricks is on CDT.
const CST_OFFSET_HOURS = parseInt(
  process.env.DATABRICKS_TZ_OFFSET_HOURS ?? "-6",
  10
);

// ── Core logic ────────────────────────────────────────────────────────────────

/**
 * Converts a [hour, minute] pair in CST to [hour, minute] in UTC.
 * Result hour is normalised to 0-23 (handles midnight wraparound).
 */
function cstToUtc(hour, minute) {
  let utcHour = hour - CST_OFFSET_HOURS; // subtract negative = add
  if (utcHour >= 24) utcHour -= 24;
  if (utcHour < 0) utcHour += 24;
  return [utcHour, minute];
}

// Pre-compute refresh times in UTC as [hour, minute] pairs
const REFRESH_TIMES_UTC = REFRESH_TIMES_CST.map(([h, m]) => cstToUtc(h, m));

/**
 * Returns a Date representing the next Databricks refresh instant (+ buffer).
 *
 * @returns {Date} UTC Date after which the cache should be considered stale.
 */
export function getNextRefreshTime() {
  const now = new Date();

  const candidates = [];
  for (const [utcHour, utcMinute] of REFRESH_TIMES_UTC) {
    const today = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        utcHour,
        utcMinute + BUFFER_MINUTES,
        0,
        0
      )
    );
    candidates.push(today);

    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    candidates.push(tomorrow);
  }

  candidates.sort((a, b) => a - b);
  const next = candidates.find((d) => d > now);
  // Fallback: 1 hour from now (should never be reached)
  return next ?? new Date(now.getTime() + 60 * 60 * 1000);
}

export function getMsUntilNextRefresh() {
  return getNextRefreshTime().getTime() - Date.now();
}

export function getScheduleSummary() {
  const next = getNextRefreshTime();
  return {
    schedule_cst: REFRESH_TIMES_CST.map(
      ([h, m]) =>
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} CST`
    ),
    schedule_utc: REFRESH_TIMES_UTC.map(
      ([h, m]) =>
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`
    ),
    buffer_minutes: BUFFER_MINUTES,
    cache_type: "in-process (per instance)",
    next_cache_expiry_utc: next.toISOString(),
    next_cache_expiry_ist: next.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    }),
    next_cache_expiry_cst: next.toLocaleString("en-US", {
      timeZone: "America/Chicago",
    }),
    ms_until_expiry: getMsUntilNextRefresh(),
    azure_note:
      "Each App Service instance has its own cache. Scale-out causes independent cache misses per instance — all backed by Databricks.",
  };
}
