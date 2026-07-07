# DEPLOY.md — dockerstackcronjob

Triển khai **cronjob-manager** (backend Fastify + frontend Next.js) bằng
docker-stack template: Caddy + Cloudflare Tunnel + Tinyauth + Ops (Dozzle/Filebrowser/WebSSH).

App = 1 service `app` (container `main-app`) chạy 2 tiến trình:
- **backend** (Fastify API + RTDB queue consumer) — cổng nội bộ `BACKEND_PORT` (8080).
- **frontend** (Next.js dashboard) — cổng public `APP_PORT` (3000), proxy `/proxy/*` → backend.

Nguồn dữ liệu: **Firebase Realtime Database** (remote). App không dùng SQLite.

---

## 0) Yêu cầu
- Docker + Docker Compose v2 (`docker compose`).
- 1 domain trỏ qua Cloudflare Tunnel (hoặc dùng Tailscale để truy cập nội bộ).
- Firebase RTDB + service account JSON (hoặc legacy DB secret).

---

## 1) Chuẩn bị `.env`

```bash
cp .env.example .env
```

Điền tối thiểu:

| Nhóm | Biến | Ghi chú |
|---|---|---|
| Identity | `PROJECT_NAME`, `PROJECT_NAME_TAILSCALE`, `DOMAIN`, `CADDY_EMAIL` | subdomain + email Caddy |
| Tinyauth (stack) | `TINYAUTH_APP_URL`, `TINYAUTH_PORT`, `TINYAUTH_DB_FILE`, `TINYAUTH_USERS`, `TINYAUTH_COOKIE_SECURE`, `TINYAUTH_TRUSTED_PROXIES` | `TINYAUTH_USERS` dùng bcrypt escaped `$$` |
| App port | `APP_PORT=3000`, `BACKEND_PORT=8080`, `HEALTH_PATH=/api/health-check` | |
| App secret | `API_SECRET` | chuỗi ngẫu nhiên mạnh, ≥ 8 ký tự |
| Firebase | `FIREBASE_DB_URL` + `FIREBASE_SERVICE_ACCOUNT` (ưu tiên) hoặc `FIREBASE_AUTH_SECRET` | xem §2 |
| cronjob.org | `CRONJOB_API_BASE` | mặc định `https://api.cron-job.org` |
| Flags | `ENABLE_LITESTREAM=false` (app không cần), `ENABLE_TAILSCALE`, `ENABLE_DOZZLE`… | |

> `TINYAUTH_USERS` (stack) khác `APP_TINYAUTH_USERS` (app). App KHÔNG đọc `TINYAUTH_USERS`.

---

## 2) Nạp Firebase service account

Cách khuyến nghị (base64, an toàn shell/Docker/CI):

```bash
# từ repo gốc chứa file JSON:
base64 -w0 envs/data-dockerstackcronjobmanager-firebase-adminsdk-*.json
# copy kết quả vào .env:
FIREBASE_SERVICE_ACCOUNT=<chuỗi base64>
FIREBASE_DB_URL=https://data-dockerstackcronjobmanager-default-rtdb.asia-southeast1.firebasedatabase.app
```

App tự parse mọi ENV JSON theo **base64 → raw fallback**, nên có thể paste raw JSON khi dev.

Thứ tự resolve auth RTDB (fail-fast nếu thiếu):
1. `RTDB_MODE=memory` → store in-process (dev/demo/CI).
2. `FIREBASE_SERVICE_ACCOUNT` → mint OAuth token Google (**ưu tiên**).
3. `FIREBASE_AUTH_SECRET` → legacy `?auth=`.

---

## 3) Cloudflared

```bash
cp cloudflared/config.yml.example cloudflared/config.yml   # rồi sửa hostname
# đặt cloudflared/credentials.json từ tunnel của bạn
```

Ingress cần trỏ `${PROJECT_NAME}.${DOMAIN}` và `auth.${DOMAIN}` vào Caddy.

---

## 4) Validate trước khi chạy (bắt buộc)

```bash
npm run dockerapp-validate:env
npm run dockerapp-validate:compose
# hoặc cả gói:
npm run dockerapp-validate:all
```

Có lỗi `❌` → phải sửa trước khi deploy.

---

## 5) Deploy

```bash
npm run dockerapp-exec:up        # dc.sh up -d --build --remove-orphans
npm run dockerapp-exec:ps
npm run dockerapp-exec:logs:app
```

Build có BuildKit cache trên CI:

```bash
npm run dockerapp-exec:ci-build
```

---

## 6) Kiểm tra sau deploy

```bash
# Trên host (nếu publish APP_HOST_PORT):
curl http://127.0.0.1:${APP_HOST_PORT:-3000}/api/health-check
# → {"status":"ok","rtdb":"service_account", ...}

# Qua Cloudflare (sau Tinyauth):
#   https://${PROJECT_NAME}.${DOMAIN}
```

Checklist:
- [ ] `main-app` healthy (`dockerapp-exec:ps`).
- [ ] `/api/health-check` trả `status: ok` và đúng `rtdb` mode.
- [ ] Đăng nhập Tinyauth OK khi vào domain public.
- [ ] Dashboard tải, các trang Resources/Cronjobs/Executor gọi `/proxy/*` thành công.

---

## 7) Kiến trúc container

```
                 Cloudflare Tunnel / Tailscale
                              │
                           [Caddy] ──forward_auth──► [Tinyauth] (stack, SQLite)
                              │ reverse_proxy :APP_PORT
                              ▼
        ┌──────────── container: main-app ────────────┐
        │  frontend (Next.js)  :APP_PORT  (public)     │
        │      │  /proxy/*  + x-api-secret (server)    │
        │      ▼                                        │
        │  backend (Fastify)   :BACKEND_PORT (nội bộ)  │
        │      • Resource CRUD / Taxonomy               │
        │      • Cronjob mgmt (cronjob.org)             │
        │      • Executor + RTDB queue consumer         │
        └───────────────────┬───────────────────────────┘
                             ▼
                    [Firebase RTDB]  (remote, source of truth)
```

---

## 8) Backup / dữ liệu
- App **không** ghi DB cục bộ (RTDB là remote). `/app/logs`, `/app/data` chỉ là log/scratch.
- Litestream (nếu `ENABLE_LITESTREAM=true`) chỉ backup DB của Tinyauth, không liên quan app.
- Nếu bật Rclone: mọi thứ dưới `${DOCKER_VOLUMES_ROOT}` được sync lên remote.

---

## 9) CI
- `services/app/backend`: `npm run ci` (typecheck + 50 test offline + build) — chạy được offline
  nhờ fake cronjob.org emulator + in-memory RTDB.
- `services/app/frontend`: `npm run ci` (typecheck + `next build`).
- Template: `.github/workflows/*` và `.azure/azure-pipelines.yml` build stack qua `ci-build.sh`.
