# SPEC.md — dockerstackcronjob

Đặc tả kỹ thuật: đưa app **cronjob-manager** vào **docker-stack-template**,
tuân thủ các invariant của template (xem `AGENT_APP_SWAP.md`).

## 1. Ứng dụng

**cronjob-manager (CronOps Pro)** — quản lý nhiều tài khoản cronjob.org + GitHub token
+ Azure PAT (CRUD, taxonomy, batch import/export), quản lý cronjob đầy đủ, và một
executor động chạy handler `.mjs/.js` qua HTTP + hàng đợi job trên RTDB.

- **Backend:** Node.js + TypeScript + Fastify. Build bằng `tsup` → `dist/index.js`.
  Một tiến trình chạy đồng thời API server + RTDB queue consumer (durable, resume-on-boot).
- **Frontend:** Next.js 14 (App Router, Tailwind). Có route `/proxy/[...path]` inject
  `x-api-secret` server-side, và `/api/health-check` proxy sang backend `/health`.
- **Nguồn dữ liệu:** Firebase Realtime Database (remote) — accounts, tokens, pats, jobs,
  taxonomy, exec-queue, logs. Có `RTDB_MODE=memory` cho dev/test.
- **Parse ENV:** mọi ENV JSON dùng base64 → raw fallback.

## 2. Ánh xạ vào template

Template yêu cầu **1 service `app`** (container `main-app`). App là monorepo 2 tiến trình,
nên chạy cả hai trong 1 container qua `entrypoint.sh`:

| Thành phần | Cổng | Vai trò |
|---|---|---|
| frontend (Next.js) | `APP_PORT` (3000) | public, sau Tinyauth; proxy `/proxy/*` → backend |
| backend (Fastify) | `BACKEND_PORT` (8080) | nội bộ container, chỉ frontend gọi |

- `HEALTH_PATH=/api/health-check` → healthcheck xác nhận cả frontend lẫn backend.
- `BACKEND_URL=http://127.0.0.1:${BACKEND_PORT}` (đặt trong entrypoint).

## 3. File đã thêm/sửa trong `dockerstackcronjob`

| File | Thay đổi |
|---|---|
| `services/app/backend/**` | copy toàn bộ backend cronjob-manager |
| `services/app/frontend/**` | copy toàn bộ frontend cronjob-manager |
| `services/app/Dockerfile` | multi-stage: build backend+frontend → runner 2 tiến trình |
| `services/app/entrypoint.sh` | chạy backend + frontend, fail-fast nếu 1 tiến trình chết |
| `services/app/.dockerignore` | loại node_modules/dist/.next/test khỏi build context |
| `compose.apps.yml` | thêm `BACKEND_PORT` env, healthcheck `/api/health-check`, `start_period=40s` |
| `.env.example` | thêm khối APP (BACKEND_PORT, API_SECRET, FIREBASE_*, CRONJOB_*, EXEC_*, LOG_*), đổi `HEALTH_PATH` |
| `docker-compose/scripts/validate-env.js` | thêm validate `BACKEND_PORT`, `API_SECRET`, Firebase, `CRONJOB_API_BASE`… |
| `services/app/backend/src/config/env.ts` | đổi `TINYAUTH_*` của app → `APP_TINYAUTH_*` (tránh xung đột với Tinyauth stack) |
| `services/app/backend/src/config/dotenv.ts` | strip inline comment cho value không quote (JSON-safe) |
| `docs/services/app.md` | mô tả lại app service cho cronjob-manager |
| `DEPLOY.md`, `USAGE.md`, `SPEC.md`, `README.md` | tài liệu |

## 4. Tuân thủ invariant (AGENT_APP_SWAP.md §2)

| # | Invariant | Trạng thái |
|---|---|---|
| 1 | Service name `app` | ✅ giữ nguyên |
| 2 | Container name `main-app` | ✅ giữ nguyên |
| 3 | `app` trên `app_net` | ✅ |
| 4 | Caddy labels dùng `${ENV_VAR}` | ✅ không hard-code |
| 5 | `APP_PORT` là nguồn sự thật cổng | ✅ (frontend public) |
| 6 | `HEALTH_PATH` trỏ endpoint thật | ✅ `/api/health-check` (đã test) |
| 7 | Healthcheck `wget .../${HEALTH_PATH}` | ✅ |
| 8 | Data bind mount dưới `${DOCKER_VOLUMES_ROOT}` | ✅ `/app/logs`, `/app/data` |
| 9 | Tinyauth/Litestream ở `compose.auth.yml` | ✅ không đổi |
| 10 | App bảo vệ bằng `forward_auth` (không Basic Auth) | ✅ giữ 4 labels |
| 11 | `depends_on: tinyauth: service_healthy` | ✅ (Litestream gate chỉ khi dùng SQLite — app không dùng) |
| 12–20 | Litestream (SQLite) | N/A — app dùng **RTDB remote**, không SQLite |
| 14 | `restart: unless-stopped` | ✅ |
| 15 | Service mới join `app_net` | ✅ |
| 25–27 | Tinyauth labels/format | ✅ không đổi (thuộc stack) |

> Ngoại lệ có chủ đích: invariant #11 phần Litestream-restore gate không áp dụng vì app
> KHÔNG dùng SQLite. App vẫn giữ `depends_on: tinyauth: service_healthy`.

## 5. Kiểm thử đã thực hiện (dữ liệu thật)

1. **Backend test suite:** 50/50 pass (offline, fake cronjob.org emulator + in-memory RTDB).
2. **Firebase RTDB (service account):** mint OAuth token + PUT/GET/DELETE round-trip ✅.
3. **Firebase RTDB (legacy secret `?auth=`):** round-trip ✅.
4. **GitHub token:** xác thực user `o25160702-t5`, repo `o25160702-t5/cronjob-manager` (public), workflows ✅.
5. **cronjob.org API key:** `GET /jobs` → 200 ✅.
6. **App end-to-end (container-equivalent, RTDB thật):**
   - `/api/health-check` → `status: ok`, `rtdb: service_account`.
   - `/proxy/accounts` → đọc RTDB thật, secret server-side.
   - `/proxy/exec/enqueue` → queue consumer xử lý (`queue job processed`).
   - `/proxy/logs/exec` → đọc log từ RTDB thật.
7. **Template validators:** `dockerapp-validate:env`, `:compose`, `:ts` đều ✅.

> Lưu ý môi trường sandbox không có Docker daemon → kiểm thử app theo mô hình
> "container-equivalent" (chạy đúng 2 tiến trình như `entrypoint.sh`, cùng cổng, cùng env,
> đánh vào đúng `HEALTH_PATH`). Dockerfile/compose đã qua validate cú pháp.

## 6. Bí mật (đã dùng để test — cần luân chuyển trước production)
- Firebase service account: `envs/data-...-firebase-adminsdk-*.json`.
- RTDB URL: `https://data-dockerstackcronjobmanager-default-rtdb.asia-southeast1.firebasedatabase.app`.
- Các token/secret khác được cung cấp trong prompt — KHÔNG commit vào repo public.

## 7. RTDB security rules gợi ý

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "exec-queue": { ".write": "auth != null" }
  }
}
```

Backend dùng service account (full access); nếu hệ thống ngoài ghi trực tiếp `/exec-queue`
thì mở write-only tại đúng path đó.
