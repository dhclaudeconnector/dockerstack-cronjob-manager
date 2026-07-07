# USAGE.md — cronjob-manager (dockerstackcronjob)

Hướng dẫn sử dụng ứng dụng sau khi đã deploy (xem `DEPLOY.md`).

## Truy cập

- **Dashboard (UI):** `https://${PROJECT_NAME}.${DOMAIN}` — sau khi qua đăng nhập Tinyauth.
- **Local test:** `http://127.0.0.1:${APP_HOST_PORT:-3000}` (nếu publish port).
- **Health:** `GET /api/health-check` → `{ "status": "ok", "rtdb": "...", "time": ... }`.

## Mô hình gọi API (quan trọng)

- Trình duyệt **không** gọi backend trực tiếp. Mọi hành động UI → `/proxy/<path>`.
- Next.js proxy chuyển tiếp tới backend `/(api)/<path>` và tự chèn header `x-api-secret`
  (`API_SECRET`) ở **server-side** — secret không bao giờ ra client.
- Nếu gọi backend trực tiếp (server-to-server), thêm header `x-api-secret: <API_SECRET>`.

Ví dụ (qua proxy, từ trình duyệt/đồng máy):

```bash
curl https://${PROJECT_NAME}.${DOMAIN}/proxy/accounts
curl https://${PROJECT_NAME}.${DOMAIN}/proxy/jobs
```

Ví dụ (gọi backend trực tiếp, cần secret):

```bash
curl -H "x-api-secret: $API_SECRET" http://127.0.0.1:8080/api/accounts
```

## Các trang UI

| Trang | Chức năng |
|---|---|
| `/` | Tổng quan (Precision Infrastructure System dashboard) |
| `/resources` | Quản lý accounts (cronjob.org), github-tokens, azure-pats: CRUD + batch import/export |
| `/cronjobs` | Quản lý cronjob: tạo/bật/tắt/xoá, xem next-run + log chi tiết |
| `/executor` | Chạy handler `.mjs/.js`, đẩy job vào queue, xem trạng thái exec |
| `/settings` | Cấu hình |

## API backend (tất cả dưới `/api`, cần `x-api-secret`; qua UI là `/proxy/...`)

### Resources (`<type>` ∈ `accounts` | `github-tokens` | `azure-pats`)
```
GET/POST         /api/<type>                # list (?tag=&project=&collection=&q=) / create
GET/PATCH/DELETE /api/<type>/:id            # read / update / delete
POST             /api/<type>/batch-import   # JSON/CSV import (report từng dòng)
GET              /api/<type>/batch-export   # JSON/CSV export
```

### Taxonomy
```
GET/POST/PATCH/DELETE /api/{tags|projects|collections}[/:id]
```

### Cronjobs (đồng bộ với cronjob.org, mirror vào RTDB)
```
GET   /api/jobs?accountId=&tag=&project=&collection=
POST  /api/jobs                     # tạo trên cronjob.org + mirror RTDB
GET   /api/jobs/:jobId              # chi tiết + nextRunAt
PATCH /api/jobs/:jobId              # schedule/url/tags/project/collection
POST  /api/jobs/:jobId/enable       # resume
POST  /api/jobs/:jobId/disable      # pause
DELETE /api/jobs/:jobId
GET   /api/jobs/:jobId/logs         # lịch sử chạy chi tiết
POST  /api/jobs/sync?accountId=     # kéo toàn bộ job từ cronjob.org
```

### Executor
```
POST /api/exec/file/:name   # chạy handler .mjs/.js (sync), body = data
POST /api/exec/fn/:name     # chạy fn handler đã đăng ký (sync)
POST /api/exec/enqueue      # đẩy job vào RTDB queue (async)
GET  /api/exec/queue        # liệt kê queue
GET  /api/exec/:execId      # trạng thái + output + log 1 lần chạy
GET  /api/exec/handlers     # danh sách handler khả dụng
```

`enqueue` body:
```json
{ "target": { "type": "file", "name": "data_sync" }, "data": { "any": "payload" } }
```

### Logs
```
GET /api/logs/exec
GET /api/logs/jobs[?jobId=]
```

## Executor & queue
- Handler nằm ở `services/app/backend/handlers/` — mỗi file `export default async (data, ctx) => result`.
  Mặc định có `cache_purge.mjs`, `data_sync.mjs`.
- `EXEC_ALLOWED` whitelist tên handler (rỗng `[]` = cho phép tất cả trong dir).
- Chạy với timeout `EXEC_TIMEOUT_MS`, output được capture + log.
- RTDB queue (`/exec-queue`): FIFO theo push key, single-consumer, `pending → processing → done|failed`,
  **tự resume job `processing` treo sau restart**, idempotent theo push key.

## Bảo mật
- Secrets (key cronjob.org, GitHub token, Azure PAT) được **mask** (chỉ hiện 4 ký tự cuối) trong mọi response.
- Nếu đặt `SECRET_ENCRYPTION_KEY` → mã hoá AES-256-GCM khi lưu vào RTDB.
- `API_SECRET` bắt buộc cho mọi `/api`, không bao giờ rời server.
- Toàn bộ app nằm sau Tinyauth `forward_auth` của Caddy.

## Chạy local (dev, không cần Firebase)

```bash
cd services/app/backend && npm install && RTDB_MODE=memory API_SECRET=dev-secret npm run dev
# terminal khác:
cd services/app/frontend && npm install && BACKEND_URL=http://localhost:8080 API_SECRET=dev-secret npm run dev
```

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `/api/health-check` trả `offline` | backend chưa lên / sai `BACKEND_PORT` | xem `dockerapp-exec:logs:app`, kiểm tra `BACKEND_PORT` |
| Backend fatal `FIREBASE auth missing` | thiếu SA/secret và không phải `RTDB_MODE=memory` | điền `FIREBASE_SERVICE_ACCOUNT` hoặc `FIREBASE_AUTH_SECRET` |
| Backend fatal parse `TINYAUTH_USERS`/`EXEC_ALLOWED` | inline comment/ định dạng sai trong `.env` | app đã strip inline comment; dùng `APP_TINYAUTH_USERS` (JSON) cho gate app |
| Proxy `502 proxy failed` | frontend không tới được backend | kiểm tra 2 tiến trình cùng chạy, `BACKEND_URL=http://127.0.0.1:${BACKEND_PORT}` |
| `401 invalid x-api-secret` | secret frontend ≠ backend | đảm bảo cùng `API_SECRET` trong `.env` |
