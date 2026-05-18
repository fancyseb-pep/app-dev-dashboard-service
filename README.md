# App Integration Scorecard — Backend

Express.js backend serving the App Integration Scorecard dashboard.

---

## Stack

- **Node.js** + **Express** (ESM modules)
- **Databricks** SQL REST API — live data for NA, EUROPE, AMESA sectors
- **SheetJS (xlsx)** — static Excel files for LATAM sector

---

## Project Structure

```
backend/
├── data/
│   └── latam/                        # LATAM Excel files (manual upload)
│       ├── incidents_LATAM.xlsx
│       ├── incidents_LATAM_1.xlsx
│       ├── alerts_LATAM.xlsx
│       └── problems_LATAM.xlsx
├── src/
│   ├── constants/
│   │   └── TableNames.js             # Databricks table name constants
│   ├── routes/
│   │   └── operations.js             # /api/operations/* endpoints
│   ├── services/
│   │   ├── databricks.js             # Databricks SQL query service
│   │   └── latamExcel.js             # LATAM Excel parser + cache
│   └── utils/
│       └── cacheSchedule.js          # Databricks refresh schedule logic
└── package.json
```

---

## Setup

```bash
npm install
```

Create a `.env` file:

```env
DATABRICKS_HOST=
DATABRICKS_TOKEN=
DATABRICKS_HTTP_PATH=

```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/operations/incidents?sector=NA` | Incident counts (12 months) |
| GET | `/api/operations/alerts?sector=NA` | Alert counts (12 months) |
| GET | `/api/operations/problems?sector=NA` | Problem counts (12 months) |
| GET | `/api/operations/cache-status` | Cache state + next refresh times |
| POST | `/api/operations/latam/refresh-cache` | Hot-reload LATAM Excel files |

**Sector values:** `NA` `EUROPE` `AMESA` `LATAM`

---

## Caching

### Databricks sectors (NA, EUROPE, AMESA)
Cache expires aligned to the Databricks refresh schedule:

| CST | UTC |
|-----|-----|
| 5:10 AM | 11:10 UTC |
| 1:10 PM | 19:10 UTC |
| 9:10 PM | 03:10 UTC |

A 5-minute buffer is added after each window before re-querying. All expiry math is done in UTC so it is unaffected by server or user timezone.

### LATAM (Excel)
Cached permanently in-process — no TTL. Re-reads files only on:
- Server restart
- `POST /api/operations/latam/refresh-cache`

---

## Updating LATAM Data

1. Replace the relevant file(s) in `backend/data/latam/`
2. Call `POST /api/operations/latam/refresh-cache`
3. No server restart needed

---

## Diagnostics

Check cache state and next refresh windows:
```
GET /api/operations/cache-status
```

Response includes expiry times in UTC, IST, and CST.
# app-dev-dashboard-service
