/**
 * latamExcel.js
 *
 * Files expected at backend/data/latam/:
 *   incidents_LATAM.xlsx   — column: "Created"
 *   incidents_LATAM_1.xlsx — column: "Created"
 *   alerts_LATAM.xlsx      — column: "Initial event generation time"
 *   problems_LATAM.xlsx    — column: "Created"
 *
 * FIRST: run `npm install xlsx` in your backend folder if not already done.
 */

import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// createRequire is the correct way to load CJS packages (like xlsx) from ESM.
// Make sure `npm install xlsx` has been run in the backend directory first.
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

// ── File locations ────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// latamExcel.js is at: backend/src/services/latamExcel.js
// data folder is at:   backend/data/latam/
// so we go up two levels: services → src → backend, then into data/latam
const EXCEL_DIR =
  process.env.LATAM_EXCEL_DIR ?? path.join(__dirname, "../../data/latam");

const FILES = {
  incidents: [
    path.join(EXCEL_DIR, "incidents_LATAM.xlsx"),
    path.join(EXCEL_DIR, "incidents_LATAM_1.xlsx"),
  ],
  alerts: [path.join(EXCEL_DIR, "alerts_LATAM.xlsx")],
  problems: [path.join(EXCEL_DIR, "problems_LATAM.xlsx")],
};

// Log resolved paths on startup so you can confirm they're correct
console.log("[latamExcel] EXCEL_DIR resolved to:", EXCEL_DIR);
console.log("[latamExcel] Files:", JSON.stringify(FILES, null, 2));

// ── Permanent in-process cache ────────────────────────────────────────────────
const _latamCache = {
  incidents: null,
  alerts: null,
  problems: null,
};

export function clearLatamCache() {
  _latamCache.incidents = null;
  _latamCache.alerts = null;
  _latamCache.problems = null;
  console.log("[latamExcel] Cache cleared — next request will re-read files.");
}

// ── Month helpers ─────────────────────────────────────────────────────────────
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

const MONTHS_12 = generateLastNMonthLabels(12);

// ── Excel reader ──────────────────────────────────────────────────────────────
function readRows(filePaths) {
  const all = [];
  for (const filePath of filePaths) {
    console.log("[latamExcel] Reading:", filePath);
    const wb = XLSX.readFile(filePath, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
    console.log(`[latamExcel] ${path.basename(filePath)} → ${rows.length} rows`);
    all.push(...rows);
  }
  return all;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel serial number → { y, m, d, H, M, S }
    const p = XLSX.SSF.parse_date_code(value);
    return new Date(p.y, p.m - 1, p.d);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function buildCountMap(rows, dateField) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const countMap = {};
  for (const row of rows) {
    const dt = toDate(row[dateField]);
    if (!dt || dt < cutoff) continue;
    const label = toMonthLabel(dt.getFullYear(), dt.getMonth() + 1);
    if (MONTHS_12.includes(label)) {
      countMap[label] = (countMap[label] ?? 0) + 1;
    }
  }
  return countMap;
}

function findColumn(rows, candidates) {
  if (!rows.length) return candidates[0];
  const keys = Object.keys(rows[0]);
  for (const candidate of candidates) {
    const found = keys.find(
      (k) => k.trim().toLowerCase() === candidate.toLowerCase()
    );
    if (found) return found;
  }
  throw new Error(
    `LATAM Excel: could not find column matching [${candidates.join(", ")}]. ` +
    `Available columns: ${keys.join(", ")}`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────
export function getLatamIncidents() {
  if (_latamCache.incidents) return _latamCache.incidents;
  const rows = readRows(FILES.incidents);
  const DATE_COL = findColumn(rows, ["Created", "created", "CREATED"]);
  const countMap = buildCountMap(rows, DATE_COL);
  const incidents = MONTHS_12.map((month) => ({ month, incidents: countMap[month] ?? 0 }));
  const payload = { months: MONTHS_12, incidents };
  _latamCache.incidents = payload;
  return payload;
}

export function getLatamAlerts() {
  if (_latamCache.alerts) return _latamCache.alerts;
  const rows = readRows(FILES.alerts);
  const DATE_COL = findColumn(rows, [
    "Initial event generation time",
    "initial event generation time",
    "INITIAL EVENT GENERATION TIME",
  ]);
  const countMap = buildCountMap(rows, DATE_COL);
  const alerts = MONTHS_12.map((month) => ({ month, alerts: countMap[month] ?? 0 }));
  const payload = { months: MONTHS_12, alerts };
  _latamCache.alerts = payload;
  return payload;
}

export function getLatamProblems() {
  if (_latamCache.problems) return _latamCache.problems;
  const rows = readRows(FILES.problems);
  const DATE_COL = findColumn(rows, ["Created", "created", "CREATED"]);
  const countMap = buildCountMap(rows, DATE_COL);
  const problems = MONTHS_12.map((month) => ({ month, problems: countMap[month] ?? 0 }));
  const payload = { months: MONTHS_12, problems };
  _latamCache.problems = payload;
  return payload;
}