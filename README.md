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

