# App service (`compose.apps.yml`) — cronjob-manager

## Vai trò
- Service ứng dụng chính (`app`, container `main-app`), build từ `services/app`.
- Đây là **monorepo 2 tiến trình** chạy trong 1 container:
  - **backend**: Fastify API + RTDB queue consumer (cổng nội bộ `BACKEND_PORT`, mặc định 8080).
  - **frontend**: Next.js dashboard (cổng public `APP_PORT`, mặc định 3000).
- Frontend proxy MỌI call `/proxy/*` sang backend qua `http://127.0.0.1:${BACKEND_PORT}`
  và tự inject header `x-api-secret` (API_SECRET) ở server-side — trình duyệt không bao giờ thấy secret.
- `entrypoint.sh` khởi động cả hai tiến trình; nếu một trong hai chết → container thoát để Docker restart.

## Cấu hình chính
- Image local tag: `${PROJECT_NAME}-app:local`
- Build context: `./services/app` (multi-stage Dockerfile: build backend+frontend → runner)
- Port expose localhost: `127.0.0.1:${APP_HOST_PORT}:${APP_PORT}` (chỉ frontend)
- Logs volume: `${DOCKER_VOLUMES_ROOT:-./.docker-volumes}/app/logs:/app/logs`
- Data volume: `${DOCKER_VOLUMES_ROOT:-./.docker-volumes}/app/data:/app/data`
- Healthcheck: `wget http://localhost:${APP_PORT}${HEALTH_PATH}`
  - `HEALTH_PATH=/api/health-check` → frontend proxy sang backend `/health`,
    nên healthcheck xác nhận **cả frontend LẪN backend** đều sống.

## ENV bắt buộc
- `APP_PORT`: cổng frontend (public) lắng nghe trong container.
- `BACKEND_PORT`: cổng backend nội bộ (frontend proxy tới đây).
- `API_SECRET`: bí mật cho mọi call `/api` (header `x-api-secret`).
- `FIREBASE_DB_URL` + (`FIREBASE_SERVICE_ACCOUNT` **hoặc** `FIREBASE_AUTH_SECRET`):
  kết nối Firebase RTDB. (Hoặc `RTDB_MODE=memory` cho dev/test không cần Firebase.)
- `PROJECT_NAME`, `DOMAIN`: tạo hostname public.
- `TINYAUTH_PORT`: port forward_auth nội bộ tới Tinyauth.

## ENV optional
- `APP_HOST_PORT` (default 3000): chỉ truy cập localhost host machine.
- `NODE_ENV` (default production).
- `HEALTH_PATH` (default `/api/health-check`).
- `CRONJOB_API_BASE` (default `https://api.cron-job.org`).
- `RTDB_EXEC_QUEUE_PATH` (default `/exec-queue`).
- `EXEC_HANDLERS_DIR` (default `/app/backend/handlers`), `EXEC_ALLOWED`, `EXEC_TIMEOUT_MS`, `EXEC_CONCURRENCY`, `EXEC_LOG_PAYLOAD`.
- `SECRET_ENCRYPTION_KEY`: nếu đặt → AES-256-GCM mã hoá tokens/PATs trong RTDB.
- `APP_TINYAUTH_ENABLED` / `APP_TINYAUTH_USERS`: gate nội bộ của app (thừa vì đã có Tinyauth stack; mặc định tắt).
- `DOCKER_VOLUMES_ROOT` (default `./.docker-volumes`).
- `TAILSCALE_TAILNET_DOMAIN`: dùng cho route HTTPS nội bộ qua caddy_1.

> ⚠️ **Namespace:** biến `TINYAUTH_USERS`/`TINYAUTH_*` thuộc về service **Tinyauth của stack**
> (bcrypt escaped `$$`). App KHÔNG đọc chúng — app dùng tiền tố `APP_TINYAUTH_*` để tránh xung đột.

## Routing
- Public host: `${PROJECT_NAME}.${DOMAIN}` (+ alias `main.${DOMAIN}`, `${DOMAIN}`).
- Internal HTTPS host: `${PROJECT_NAME_TAILSCALE}.${TAILSCALE_TAILNET_DOMAIN}` với `tls internal`.
- Auth: Caddy `forward_auth` tới `tinyauth:${TINYAUTH_PORT}` và ép `X-Forwarded-Proto https`.

## Auth/Litestream layer
- Tinyauth và Litestream nằm ở `docker-compose/compose.auth.yml`, không đặt trong `compose.apps.yml`.
- App chỉ giữ 4 labels `forward_auth` trỏ tới `tinyauth:${TINYAUTH_PORT}`.
- **cronjob-manager KHÔNG dùng SQLite** — nguồn sự thật là **Firebase RTDB** (remote).
  Do đó KHÔNG cần Litestream cho app; Litestream (nếu bật) chỉ backup DB của Tinyauth.
- Nếu sau này thêm SQLite cho app: theo checklist Litestream trong `AGENT_APP_SWAP.md` §4a.
