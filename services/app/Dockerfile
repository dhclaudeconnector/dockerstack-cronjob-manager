# syntax=docker/dockerfile:1.7
# ================================================================
#  services/app/Dockerfile — cronjob-manager (backend + frontend)
#
#  App = monorepo 2 tiến trình chạy trong 1 container "main-app":
#    - backend : Fastify API + RTDB queue consumer (internal port 8080)
#    - frontend: Next.js dashboard (public port = ${PORT} / APP_PORT)
#  Frontend proxy mọi call tới backend qua BACKEND_URL=http://127.0.0.1:8080.
#
#  Layer sắp xếp "ổn định trước, hay đổi sau" để TỐI ĐA HÓA cache hit:
#    1. Base image + user (gần như không đổi)
#    2. Manifest + cài deps (chỉ rebuild khi package*.json đổi)
#    3. Copy source + build (đổi nhiều nhất → để CUỐI)
#  Cache mount /root/.npm tái dùng package đã tải giữa các lần build.
# ================================================================

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder
WORKDIR /build

# 2a) Backend deps (manifest trước để cache)
COPY backend/package.json backend/package-lock.json* ./backend/
RUN --mount=type=cache,target=/root/.npm \
    cd backend && npm install

# 2b) Frontend deps
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN --mount=type=cache,target=/root/.npm \
    cd frontend && npm install

# 3) Copy toàn bộ source (đổi nhiều nhất) + build
COPY backend ./backend
COPY frontend ./frontend
RUN cd backend && npm run build          # tsup -> backend/dist
RUN cd frontend && npm run build         # next build -> frontend/.next

# Cắt bớt devDependencies của backend cho runtime (frontend cần deps để next start)
RUN cd backend && npm prune --omit=dev

# ---------- Stage 2: runner ----------
FROM node:20-alpine AS runner

# Layer ổn định: user không phải root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
# wget đã có sẵn trong alpine (busybox) cho healthcheck.

WORKDIR /app

ENV NODE_ENV=production

# Backend runtime (dist + node_modules đã prune + handlers)
COPY --from=builder /build/backend/dist ./backend/dist
COPY --from=builder /build/backend/node_modules ./backend/node_modules
COPY --from=builder /build/backend/package.json ./backend/package.json
COPY --from=builder /build/backend/handlers ./backend/handlers

# Frontend runtime (.next + node_modules + config)
COPY --from=builder /build/frontend/.next ./frontend/.next
COPY --from=builder /build/frontend/node_modules ./frontend/node_modules
COPY --from=builder /build/frontend/package.json ./frontend/package.json
COPY --from=builder /build/frontend/next.config.js ./frontend/next.config.js
COPY --from=builder /build/frontend/public ./frontend/public

# Entrypoint chạy 2 tiến trình
COPY entrypoint.sh /app/entrypoint.sh

# Thư mục runtime (logs/data) + quyền
RUN mkdir -p /app/logs /app/data && chmod +x /app/entrypoint.sh && chown -R appuser:appgroup /app

USER appuser

# Public port = frontend (Next.js). APP_PORT được inject từ compose (mặc định 3000).
EXPOSE 3000

# Healthcheck gọi frontend /api/health-check → frontend proxy sang backend /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health-check || exit 1

CMD ["/app/entrypoint.sh"]
