# ==============================================================================
# Nginx Dockerfile - Multi-stage build with frontend
# ==============================================================================

# ==============================================================================
# Stage 1: Build Admin Frontend
# ==============================================================================
FROM node:18-alpine AS admin_builder

WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY rag_web_admin/package*.json ./

# 安裝所有依賴（包含 devDependencies）
RUN npm ci

# 複製源碼和配置文件
COPY rag_web_admin/ .

# 設定環境變數（從 Docker Compose 傳入）
ARG VITE_API_BASE_URL=/api
ARG VITE_BASE_PATH=/admin

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

# 建置應用
RUN npm run build

# ==============================================================================
# Stage 2: Build Query Frontend
# ==============================================================================
FROM node:18-alpine AS query_builder

WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY rag_web_query/package*.json ./

# 安裝所有依賴（包含 devDependencies）
RUN npm ci

# 複製源碼和配置文件
COPY rag_web_query/ .

# 設定環境變數（從 Docker Compose 傳入）
ARG VITE_API_BASE_URL=/api
ARG VITE_BASE_PATH=/query

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

# 建置應用
RUN npm run build

# ==============================================================================
# Stage 3: Production - Nginx with built frontend files
# ==============================================================================
FROM nginx:alpine

# 複製自訂配置
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# 從 builder stages 複製建置好的檔案
COPY --from=admin_builder /app/dist /usr/share/nginx/html/admin
COPY --from=query_builder /app/dist /usr/share/nginx/html/query

# 暴露端口
EXPOSE 80

# Nginx 健康檢查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Nginx 會自動啟動
CMD ["nginx", "-g", "daemon off;"]
