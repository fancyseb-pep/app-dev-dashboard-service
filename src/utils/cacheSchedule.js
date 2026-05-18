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
 * Strategy:
 *   When we cache a result, we find the NEXT Databricks refresh time that
 *   hasn't happened yet (in UTC), and set the cache to expire a few minutes
 *   AFTER that refresh — giving Databricks time to finish writing before we
 *   re-query. We add a configurable buffer (default 5 min) so we don't race
 *   the refresh job.
 *
 * Why UTC throughout:
 *   All Date objects in Node are UTC internally. By expressing the schedule
 *   in UTC we never touch the server's local timezone or the user's timezone.
 *   A user in Chennai (IST), London (GMT/BST), or New York (EST/EDT) all hit
 *   the same UTC boundary — the cache expires at the same instant everywhere.
 *
 * CST vs CDT:
 *   Set DATABRICKS_TZ_OFFSET_HOURS in your .env to override if Databricks
 *   ever switches to CDT (UTC-5). Default is -6 (CST).
 */

// ── Config ────────────────────────────────────────────────────────────────────

// Databricks refresh times expressed as [hour, minute] in CST (UTC-6)
const REFRESH_TIMES_CST = [
  [5, 10], // 05:10 CST → 11:10 UTC
  [13, 10], // 13:10 CST → 19:10 UTC
  [21, 10], // 21:10 CST → 03:10 UTC next day
];

// How many minutes after the refresh time before we re-query Databricks.
// Gives the ETL job time to finish writing before we read.
const BUFFER_MINUTES = parseInt(process.env.CACHE_BUFFER_MINUTES ?? "5", 10);

// CST offset from UTC. Change to -5 if Databricks is on CDT.
const CST_OFFSET_HOURS = parseInt(
  process.env.DATABRICKS_TZ_OFFSET_HOURS ?? "-6",
  10,
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
 * Algorithm:
 *  1. Take the current UTC time.
 *  2. For each of today's refresh windows (in UTC), check if it's still
 *     in the future (accounting for buffer). Take the earliest one.
 *  3. If all of today's windows have passed, take the earliest one tomorrow.
 *
 * @returns {Date} UTC Date after which the cache should be considered stale.
 */
export function getNextRefreshTime() {
  const now = new Date(); // always UTC internally in Node

  // Build candidate Date objects for each refresh slot, for today and tomorrow
  const candidates = [];

  for (const [utcHour, utcMinute] of REFRESH_TIMES_UTC) {
    // Today's slot
    const today = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        utcHour,
        utcMinute + BUFFER_MINUTES,
        0,
        0,
      ),
    );
    candidates.push(today);

    // Tomorrow's slot (handles the 03:10 UTC slot wrapping past midnight)
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    candidates.push(tomorrow);
  }

  // Sort ascending and pick the first one strictly after now
  candidates.sort((a, b) => a - b);
  const next = candidates.find((d) => d > now);

  // Fallback: should never happen with today+tomorrow coverage, but be safe
  return next ?? new Date(now.getTime() + 60 * 60 * 1000);
}

/**
 * Returns milliseconds until the next cache expiry.
 * Useful for logging / health-check endpoints.
 */
export function getMsUntilNextRefresh() {
  return getNextRefreshTime().getTime() - Date.now();
}

/**
 * Human-readable summary of the refresh schedule — handy for a health endpoint.
 */
export function getScheduleSummary() {
  const next = getNextRefreshTime();
  return {
    schedule_cst: REFRESH_TIMES_CST.map(
      ([h, m]) =>
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} CST`,
    ),
    schedule_utc: REFRESH_TIMES_UTC.map(
      ([h, m]) =>
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`,
    ),
    buffer_minutes: BUFFER_MINUTES,
    next_cache_expiry_utc: next.toISOString(),
    next_cache_expiry_ist: next.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    }),
    next_cache_expiry_cst: next.toLocaleString("en-US", {
      timeZone: "America/Chicago",
    }),
    ms_until_expiry: getMsUntilNextRefresh(),
  };
}
