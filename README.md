# Scorecard Backend

Express + Node.js backend for the App Integration Scorecard dashboard.  
Queries Azure Databricks via the SQL REST API and serves data to the React frontend.

---

## Quick Start (Local Dev)

```bash
npm install
cp .env.example .env
# Fill in your Databricks credentials in .env (see Environment Variables below)
npm run dev       # development mode with auto-restart
# or
npm start         # production mode
```

Backend runs at **http://localhost:5000**

Test it:
```
http://localhost:5000/health
http://localhost:5000/api/operations/incidents?sector=NA
```

---

## Environment Variables

### Local dev — `backend/.env`

Create this file by copying `.env.example`. **Never commit it to git.**

```bash
# ── Required ──────────────────────────────────────────────────────────────────
DATABRICKS_HOST=adb-XXXXXXXXXXXXXXXXX.X.azuredatabricks.net
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/XXXXXXXXXXXXXXXX
DATABRICKS_TOKEN=dapiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ── CORS — allow your local frontend ─────────────────────────────────────────
FRONTEND_ORIGIN=http://localhost:3000

# ── DO NOT set API_SECRET_KEY locally ────────────────────────────────────────
# auth.js skips the key check entirely when this is absent.
# Only set it in production (via cf set-env).
```

### When is each variable required?

| Variable | Local Dev | Production (BTP CF) | Description |
|---|---|---|---|
| `DATABRICKS_HOST` | ✅ Required | ✅ Required | Databricks workspace hostname |
| `DATABRICKS_HTTP_PATH` | ✅ Required | ✅ Required | SQL warehouse HTTP path |
| `DATABRICKS_TOKEN` | ✅ Required | ✅ Required | Databricks personal access token |
| `FRONTEND_ORIGIN` | ✅ Required | ✅ Required | Allowed frontend URL(s) for CORS |
| `NODE_ENV` | ❌ Not needed | ✅ Set to `production` | Enables prod-only guards |
| `API_SECRET_KEY` | ❌ Do not set | ✅ Required | Protects API via `x-api-key` header |
| `PORT` | ❌ Not needed | ❌ CF injects this | Defaults to `5000` locally |
| `CACHE_BUFFER_MINUTES` | ❌ Optional | ❌ Optional | Minutes after DB refresh before re-query. Default: `5` |
| `DATABRICKS_TZ_OFFSET_HOURS` | ❌ Optional | ❌ Optional | UTC offset for CST. Default: `-6` |

> **Why no `API_SECRET_KEY` locally?**  
> `auth.js` checks `if (!secret) return next()` — when the key is absent the
> middleware is skipped entirely and all requests pass through. This means you
> don't need to configure matching keys across both servers just to run locally.

### Where to find Databricks values

**`DATABRICKS_HOST`** — Open your Databricks workspace in the browser. Copy only the hostname from the URL:
```
https://adb-1234567890123456.7.azuredatabricks.net
         ↑ copy only this (no https://)
```

**`DATABRICKS_HTTP_PATH`** — In Databricks → SQL Warehouses → your warehouse → **Connection details** tab → copy HTTP Path:
```
/sql/1.0/warehouses/abc1234def567890
```

**`DATABRICKS_TOKEN`** — In Databricks → top-right profile icon → **Settings** → **Developer** → **Access tokens** → Generate new token (starts with `dapi`).

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | ❌ Public | Health check — used by CF health probe |
| GET | `/api/operations/incidents?sector=NA` | ✅ | Monthly incident counts (last 12 months) |
| GET | `/api/operations/problems?sector=NA` | ✅ | Monthly problem counts (last 12 months) |
| GET | `/api/operations/alerts?sector=NA` | ✅ | Monthly alert counts (last 12 months) |
| GET | `/api/operations/cache-status` | ✅ | Cache diagnostics and next refresh windows |

**Sector values:** `NA` · `EUROPE` · `AMESA` · `LATAM`

### Example responses

**GET /api/operations/incidents?sector=NA**
```json
{
  "months": ["Jun 24", "Jul 24", "Aug 24", "..."],
  "incidents": [
    { "month": "Jun 24", "incidents": 42 },
    { "month": "Jul 24", "incidents": 38 }
  ]
}
```

---

## Auth

All `/api/*` routes go through `auth.js` middleware:

- **`API_SECRET_KEY` not set** → auth is skipped, all requests pass (local dev)
- **`API_SECRET_KEY` is set** → every request must include the header:
  ```
  x-api-key: your-secret-key
  ```
  Requests without it receive `401 Unauthorized`.

The `/health` endpoint is always public — required for CF health checks.

---

## Caching

The backend uses a **schedule-aligned cache** instead of a fixed TTL.

Databricks refreshes its data at three known times daily (CST):
- 5:10 AM · 1:10 PM · 9:10 PM

Each cache entry expires at the **next refresh window + CACHE_BUFFER_MINUTES**.  
Cache is keyed by `type:sector` (e.g. `incidents:NA`, `problems:EUROPE`).

Check cache state anytime:
```
GET /api/operations/cache-status
```

---

## SAP BTP Cloud Foundry Deployment

### First deployment

```bash
# 1. Login
cf login -a <url>

# 2. Push (node_modules excluded via .cfignore — CF installs them during staging)
cf push

# 3. Set all environment variables
cf set-env app-integration-dashboard-service DATABRICKS_HOST "adb-xxx.azuredatabricks.net"
cf set-env app-integration-dashboard-service DATABRICKS_HTTP_PATH "/sql/1.0/warehouses/xxx"
cf set-env app-integration-dashboard-service DATABRICKS_TOKEN "dapiXXXXXXXXXX"
cf set-env app-integration-dashboard-service NODE_ENV "production"
cf set-env app-integration-dashboard-service FRONTEND_ORIGIN "frontend_url"
cf set-env app-integration-dashboard-service API_SECRET_KEY "your-long-random-secret"

# 4. Restage so vars take effect
cf restage app-integration-dashboard-service

# 5. Verify
cf apps
# app-integration-dashboard-service   started   1/1
```

### Updating the app

```bash
cf push
# Env vars persist across pushes — no need to re-set them
```

### Useful commands

```bash
cf logs app-integration-dashboard-service --recent   # crash logs
cf logs app-integration-dashboard-service            # live logs
cf env app-integration-dashboard-service             # view all env vars
cf restart app-integration-dashboard-service         # restart without re-push
cf app app-integration-dashboard-service             # status + URL
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development mode with auto-restart on file changes |
| `npm start` | Production mode |

---
