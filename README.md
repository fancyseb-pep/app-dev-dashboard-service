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
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for chatbot functionality |
| `PORT` | — | Default: `5000` |
| `FRONTEND_ORIGIN` | Prod | Comma-separated allowed FE URLs |
| `API_SECRET_KEY` | Prod | Shared secret with FE (`x-api-key` header) |
| `NODE_ENV` | Prod | Set to `production` |
| `CACHE_BUFFER_MINUTES` | — | Default: `5` |
| `DATABRICKS_TZ_OFFSET_HOURS` | — | Default: `-6` (CST) |


