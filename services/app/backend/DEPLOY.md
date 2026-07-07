# DEPLOY.md — cronjob-manager

## Build & run

```bash
# Backend
cd backend
npm ci
npm run build            # tsup → dist/
node dist/index.js       # runs API server + RTDB queue consumer in one process

# Frontend
cd frontend
npm ci
npm run build
npm start                # Next.js production server
```

Backend and frontend share one repo-root `.env` by default (no dotenv dependency). Set `SHARED_ENV_FILE=/absolute/path/to/.env` for both processes if your process manager stores secrets elsewhere. Shell/CI env vars take precedence over file values.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | no (8080) | HTTP port |
| `LOG_LEVEL` | no (info) | trace/debug/info/warn/error |
| `LOG_FORMAT` | no (json) | `json` (prod) or `pretty` (dev) |
| `API_SECRET` | **yes** | Shared secret for every `/api` call (header `x-api-secret`) |
| `TINYAUTH_ENABLED` | no (true) | Thin gate flag |
| `TINYAUTH_USERS` | no | JSON map, base64-able |
| `RTDB_MODE` | no | `memory` = in-process store (no Firebase). Leave empty for real RTDB |
| `FIREBASE_DB_URL` | yes* | RTDB URL (*unless `RTDB_MODE=memory`) |
| `FIREBASE_SERVICE_ACCOUNT` | one-of | Service account JSON / base64 / file path (**preferred**) |
| `FIREBASE_AUTH_SECRET` | one-of | Legacy DB auth secret (fallback) |
| `RTDB_EXEC_QUEUE_PATH` | no (/exec-queue) | Queue path |
| `CRONJOB_API_BASE` | no | cronjob.org base (`https://api.cron-job.org`) |
| `EXEC_HANDLERS_DIR` | no (./handlers) | Handler directory |
| `EXEC_ALLOWED` | no ([]) | JSON array of allowed handler names; `[]` = all |
| `EXEC_TIMEOUT_MS` | no (30000) | Per-exec timeout |
| `EXEC_CONCURRENCY` | no (3) | Reserved |
| `EXEC_LOG_PAYLOAD` | no (false) | Log exec payloads (beware secrets) |
| `SECRET_ENCRYPTION_KEY` | no | If set, AES-256-GCM encrypt secrets at rest |

**base64 → raw fallback:** any JSON ENV (`FIREBASE_SERVICE_ACCOUNT`, `TINYAUTH_USERS`, `EXEC_ALLOWED`) may be given as raw JSON, base64, or (for the service account) a file path. Recommend base64 in prod/CI.

Shared frontend env values (same repo-root `.env`):

| Variable | Description |
|---|---|
| `BACKEND_URL` | Backend base URL (server-side only) |
| `API_SECRET` | Same secret as backend; injected by the Next proxy, never sent to the client |

## Firebase RTDB auth resolution

1. `RTDB_MODE=memory` → in-process store (dev/demo/CI).
2. Else if `FIREBASE_SERVICE_ACCOUNT` set → Admin OAuth (mints a short-lived Google access token from the service account) — **preferred**.
3. Else if `FIREBASE_AUTH_SECRET` set → legacy `?auth=` secret.
4. Else → fail-fast at boot with a clear message.

## RTDB security rules

Lock every path to backend (service account) only. If cronjob.org (or another system) writes directly into `/exec-queue`, open **write-only** on that exact path with an auth token in the URL:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "exec-queue": { ".write": "auth != null" }
  }
}
```

## Container

Multi-stage Dockerfile; healthcheck `GET /health`. Bake `handlers/` into the image or mount a trusted volume. The API is stateless and scales horizontally; keep the **queue consumer single-consumer** (one instance, or shard by queue path) to preserve FIFO ordering.


## Script-only production preparation

Use these files as the deployment contract:

- `.env.production.example` — shared backend + frontend production variables for one-machine deployment.
- `.github/workflows/ci.yml` — GitHub Actions test/build workflow.
- `azure-pipelines.yml` — Azure Pipelines equivalent.
- `scripts/print-secret-commands.sh` — prints GitHub/Azure secret setup commands.

Minimum flow:

```bash
cp .env.production.example .env # then fill secrets, or set SHARED_ENV_FILE
./scripts/print-secret-commands.sh
cd backend && npm ci && npm run ci
cd ../frontend && npm ci && npm run ci
```

## CI

`npm test` (backend) must be green — it runs entirely offline against the fake cronjob.org emulator and the in-memory RTDB, so no live services are needed in CI.
