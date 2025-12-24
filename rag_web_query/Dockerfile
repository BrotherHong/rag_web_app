# ==============================================================================
# Query Frontend Dockerfile - Multi-stage Build
# ==============================================================================

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝所有依賴（包含 devDependencies）
RUN npm ci

# 複製源碼和配置文件（明確指定以避免符號鏈接問題）
COPY src ./src
COPY public ./public
COPY index.html vite.config.js ./

# 設定環境變數（從 Docker Compose 傳入）
ARG VITE_API_BASE_URL=/api
ARG VITE_BASE_PATH=/query

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

# 建置應用（直接使用 vite build，不經過 npm script）
RUN npm run build

# Stage 2: Production（輕量級容器暴露構建檔案）
FROM busybox:latest

# 從 builder stage 複製建置好的檔案
COPY --from=builder /app/dist /usr/share/nginx/html/query

# 保持容器運行
CMD ["sh", "-c", "while true; do sleep 3600; done"]
