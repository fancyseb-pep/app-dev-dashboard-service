import { Router } from "express";
import { queryDatabricks } from "../services/databricks.js";
import {
  GROUP_NAME_ID_TABLE,
  OPERATIONS_TAB_ALERTS_TABLE,
  OPERATIONS_TAB_INCIDENTS_TABLE,
  OPERATIONS_TAB_PROBLEMS_TABLE,
} from "../constants/TableNames.js";
import {
  getNextRefreshTime,
  getScheduleSummary,
} from "../utils/cacheSchedule.js";

const router = Router();

// ── Sector → GRP_NM mapping ───────────────────────────────────────────────────
const SECTOR_GRP_MAP = {
  NA: [
    "PGT PROJECT - SAP MIDDLEWARE PBNA",
    "PGT SAP MIDDLEWARE PBNA",
    "PGT PROJECT - SAP MIDDLEWARE PFNA",
    "PGT SAP MIDDLEWARE PFNA",
    "PGT SAP MIDDLEWARE DS NA",
  ],
  EUROPE: [
    "PGT SAP MIDDLEWARE EUROPE",
    "PGT PROJECT - SAP MIDDLEWARE EUROPE",
    "PIRT SAP MIDDLEWARE EUROPE",
    "PIRT SAP MIDDLEWARE BODS EUROPE",
    "PIRT SAP MIDDLEWARE RUSSIA",
  ],
  AMESA: [
    "PGT SAP MIDDLEWARE AMESA",
    "PGT PROJECT - SAP MIDDLEWARE AMESA",
    "SAP MIDDLEWARE SLT BODS AMESA APAC",
    "SAP MIDDLEWARE AMESA APAC",
    "SAP MIDDLEWARE BODS AMESA APAC",
    "SAP MIDDLEWARE PO AMESA",
  ],
  LATAM: ["SAP MIDDLEWARE LATAM", "SAP MIDDLEWARE BODS LATAM"],
};

// ── Schedule-aligned Databricks cache ────────────────────────────────────────
//
// Instead of a fixed TTL (e.g. 1 hour), each cache entry expires at the next
// Databricks refresh window + buffer (see cacheSchedule.js).
//
// Example timeline (UTC):
//   10:45 UTC  — user requests NA incidents → cache MISS, query Databricks,
//                store result, set expiresAt = 11:15 UTC (11:10 + 5 min buffer)
//   10:55 UTC  — another user requests NA incidents → cache HIT (expires 11:15)
//   11:20 UTC  — Databricks has refreshed; cache entry is now expired
//                → next request is a MISS, fetches fresh data, new expiresAt
//                  is set to 19:15 UTC (next window)
//
// This means data is never older than one Databricks cycle, regardless of
// how many users access the app or from which timezone they do so.
//
const _dbCache = new Map(); // Map<key, { data, expiresAt: Date }>

function dbCacheGet(key) {
  const entry = _dbCache.get(key);
  if (!entry) return null;
  if (new Date() > entry.expiresAt) {
    _dbCache.delete(key);
    return null;
  }
  return entry.data;
}

function dbCacheSet(key, data) {
  _dbCache.set(key, { data, expiresAt: getNextRefreshTime() });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toMonthLabel(year, month) {
  const d = new Date(year, month - 1, 1);
  const mon = d.toLocaleString("en-US", { month: "short" });
  const yr = String(year).slice(2);
  return `${mon} ${yr}`;
}

function generateLastNMonthLabels(n = 12) {
  const labels = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(toMonthLabel(d.getFullYear(), d.getMonth() + 1));
  }
  return labels;
}

function resolveGrpNames(sectorParam) {
  const sector = (sectorParam || "NA").toUpperCase().trim();
  const grpNames = SECTOR_GRP_MAP[sector];
  if (!grpNames || grpNames.length === 0) {
    return {
      sector: null,
      grpNames: null,
      error: `Unknown sector "${sector}". Valid values: ${Object.keys(SECTOR_GRP_MAP).join(", ")}`,
    };
  }
  return { sector, grpNames, error: null };
}

function buildInClause(values) {
  return (
    "(" +
    values.map((v) => `'${v.replace(/'/g, "''").toUpperCase()}'`).join(", ") +
    ")"
  );
}

const MONTHS_12 = generateLastNMonthLabels(12);

// ── Cache-Control headers ─────────────────────────────────────────────────────
function setCacheHeaders(res, expiresAt) {
  // Compute remaining TTL and surface Cache-Control + X-Cache-Expires
  const ms = expiresAt.getTime() - Date.now();
  const secs = Math.max(0, Math.floor(ms / 1000));
  res.setHeader("Cache-Control", `public, max-age=${secs}`);
  res.setHeader("X-Cache-Expires", expiresAt.toISOString());
}

// ── GET /api/operations/incidents ─────────────────────────────────────────────
router.get("/incidents", async (req, res, next) => {
  try {
    const { sector, grpNames, error } = resolveGrpNames(req.query.sector);
    if (error) return res.status(400).json({ error });

    // Non-LATAM and LATAM → Databricks (schedule-aligned cache)
    const cacheKey = `incidents:${sector}`;
    const cached = dbCacheGet(cacheKey);
    if (cached) {
      setCacheHeaders(res, _dbCache.get(cacheKey).expiresAt);
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const inClause = buildInClause(grpNames);
    const sql = `
      SELECT
        year(OPN_DTM)  AS yr,
        month(OPN_DTM) AS mo,
        COUNT(*)       AS incident_count
      FROM ${OPERATIONS_TAB_INCIDENTS_TABLE}
      WHERE
        UPPER(GRP_NM) IN ${inClause}
        AND UPPER(STTS_DESC) <> 'CANCELED'
        AND OPN_DTM >= DATE_TRUNC('month', ADD_MONTHS(current_timestamp(), -11))
        AND OPN_DTM <= LAST_DAY(current_timestamp())
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;
    const rows = await queryDatabricks(sql);
    const countMap = {};
    for (const row of rows) {
      const label = toMonthLabel(Number(row.yr), Number(row.mo));
      countMap[label] = (countMap[label] ?? 0) + Number(row.incident_count);
    }

    const incidents = MONTHS_12.map((month) => ({
      month,
      incidents: countMap[month] ?? 0,
    }));

    const payload = { months: MONTHS_12, incidents };
    dbCacheSet(cacheKey, payload);
    setCacheHeaders(res, _dbCache.get(cacheKey).expiresAt);
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
    return;
  } catch (err) {
    next(err);
  }
});

// ── GET /api/operations/problems ──────────────────────────────────────────────
router.get("/problems", async (req, res, next) => {
  try {
    const { sector, grpNames, error } = resolveGrpNames(req.query.sector);
    if (error) return res.status(400).json({ error });

    const cacheKey = `problems:${sector}`;
    const cached = dbCacheGet(cacheKey);
    if (cached) {
      setCacheHeaders(res, _dbCache.get(cacheKey).expiresAt);
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const inClause = buildInClause(grpNames);
    const sql = `
      SELECT
        year(P.OPN_DTM)  AS yr,
        month(P.OPN_DTM) AS mo,
        COUNT(*)         AS problem_count
      FROM ${OPERATIONS_TAB_PROBLEMS_TABLE} P
      LEFT JOIN ${GROUP_NAME_ID_TABLE} G
          ON P.ASGNMT_GRP_SYS_ID = G.GRP_SYS_ID
      WHERE
          UPPER(G.GRP_NM) IN ${inClause}
          AND P.OPN_DTM >= DATE_TRUNC('month', ADD_MONTHS(current_timestamp(), -11))
          AND P.OPN_DTM <= LAST_DAY(current_timestamp())
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;

    const rows = await queryDatabricks(sql);
    const countMap = {};
    for (const row of rows) {
      const label = toMonthLabel(Number(row.yr), Number(row.mo));
      countMap[label] = (countMap[label] ?? 0) + Number(row.problem_count);
    }

    const problems = MONTHS_12.map((month) => ({
      month,
      problems: countMap[month] ?? 0,
    }));

    const payload = { months: MONTHS_12, problems };
    dbCacheSet(cacheKey, payload);
    setCacheHeaders(res, _dbCache.get(cacheKey).expiresAt);
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
    return;
  } catch (err) {
    next(err);
  }
});

// ── GET /api/operations/alerts ────────────────────────────────────────────────
router.get("/alerts", async (req, res, next) => {
  try {
    const { sector, grpNames, error } = resolveGrpNames(req.query.sector);
    if (error) return res.status(400).json({ error });

    const cacheKey = `alerts:${sector}`;
    const cached = dbCacheGet(cacheKey);
    if (cached) {
      setCacheHeaders(res, _dbCache.get(cacheKey).expiresAt);
      res.setHeader("X-Cache", "HIT");
      return res.json(cached);
    }

    const inClause = buildInClause(grpNames);
    const sql = `
      SELECT
        year(CRTD_DTM)  AS yr,
        month(CRTD_DTM) AS mo,
        COUNT(*)        AS alert_count
      FROM ${OPERATIONS_TAB_ALERTS_TABLE}
      WHERE
        UPPER(GRP_NM) IN ${inClause}
        AND CRTD_DTM >= DATE_TRUNC('month', ADD_MONTHS(current_date(), -11))
        AND CRTD_DTM <= LAST_DAY(current_timestamp())
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;

    const rows = await queryDatabricks(sql);
    const countMap = {};
    for (const row of rows) {
      const label = toMonthLabel(Number(row.yr), Number(row.mo));
      countMap[label] = (countMap[label] ?? 0) + Number(row.alert_count);
    }

    const alerts = MONTHS_12.map((month) => ({
      month,
      alerts: countMap[month] ?? 0,
    }));

    const payload = { months: MONTHS_12, alerts };
    dbCacheSet(cacheKey, payload);
    setCacheHeaders(res, _dbCache.get(cacheKey).expiresAt);
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/operations/cache-status ─────────────────────────────────────────
// Diagnostic endpoint — shows current cache state and next refresh windows.
// Remove or auth-gate this in production if you don't want it public.
router.get("/cache-status", (req, res) => {
  const schedule = getScheduleSummary();
  const entries = [..._dbCache.entries()].map(([key, entry]) => ({
    key,
    expires_utc: entry.expiresAt.toISOString(),
    expires_ist: entry.expiresAt.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    }),
    stale: new Date() > entry.expiresAt,
  }));
  res.json({ schedule, cached_keys: entries });
});

export default router;
