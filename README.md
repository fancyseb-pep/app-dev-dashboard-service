# Scorecard Backend

Express + Node.js backend for the App Integration Scorecard dashboard.

## Quick Start (Local Dev)

```bash
npm install
cp .env.example .env
# Fill in your Databricks credentials in .env
npm start         # production mode
# or
npm run dev       # development mode with --watch (auto-restart)
```

Backend runs at **http://localhost:5000**

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABRICKS_HOST` | ✅ | e.g. `adb-xxx.azuredatabricks.net` |
| `DATABRICKS_HTTP_PATH` | ✅ | SQL warehouse HTTP path |
| `DATABRICKS_TOKEN` | ✅ | Personal access token |
| `PORT` | — | Default: `5000` |
| `FRONTEND_ORIGIN` | Prod | Comma-separated allowed FE URLs |
| `API_SECRET_KEY` | Prod | Shared secret with FE (`x-api-key` header) |
| `NODE_ENV` | Prod | Set to `production` |
| `CACHE_BUFFER_MINUTES` | — | Default: `5` |
| `DATABRICKS_TZ_OFFSET_HOURS` | — | Default: `-6` (CST) |
| `LATAM_EXCEL_DIR` | — | Override path to LATAM Excel files |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + config info |
| GET | `/api/operations/incidents?sector=NA` | Incident counts by month |
| GET | `/api/operations/problems?sector=NA` | Problem counts by month |
| GET | `/api/operations/alerts?sector=NA` | Alert counts by month |
| GET | `/api/operations/cache-status` | Cache diagnostics |
| POST | `/api/operations/latam/refresh-cache` | Clear LATAM Excel cache |

**Sector values:** `NA`, `EUROPE`, `AMESA`, `LATAM`

## Azure App Service Deployment

1. Create an Azure App Service (Node 18+ LTS, Linux)
2. Set all required env vars under **Settings → Configuration → Application Settings**
3. Set `WEBSITE_RUN_FROM_PACKAGE=1` if deploying as a zip
4. Set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` for `npm install` on deploy
5. Set `FRONTEND_ORIGIN` to your Azure Static Web Apps URL
6. Set `API_SECRET_KEY` to a strong random string (same value in FE settings)

### LATAM Excel Files on Azure

Option A — **Persistent storage (recommended)**:
- Mount an Azure File Share to `/home/data/latam`
- Set `LATAM_EXCEL_DIR=/home/data/latam`

Option B — **Azure Blob + download on startup**:
- Upload files to Blob Storage
- Download them at startup in a custom script

### Cache on Azure

The backend uses an **in-process cache** (JavaScript `Map`). On Azure App Service:
- Each instance has its own independent cache — this is fine
- Cache misses simply re-query Databricks
- All instances compute the same expiry time (schedule-aligned UTC)
- For cross-instance cache sharing, integrate Azure Cache for Redis and
  replace the `_dbCache` Map in `src/routes/operations.js`
