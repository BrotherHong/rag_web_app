# Docker 使用指南

## 專案架構

本專案使用 Docker Compose 部署，包含 5 個服務：

- **postgres**: PostgreSQL 資料庫 (Port 5434)
- **backend**: FastAPI 後端 (Port 8000)
- **admin**: React 管理介面
- **query**: React 查詢介面
- **nginx**: 反向代理 (Port 8889)

## 常用指令

### 啟動/停止

```bash
# 首次啟動（建置映像）
docker compose up -d --build

# 後續啟動
docker compose up -d

# 停止所有容器
docker compose down

# 查看服務狀態
docker compose ps
```

### 查看 Log

```bash
# 查看本地日誌檔案（推薦，每次重啟會重置）
tail -f rag_web_backend/logs/app.log

# 搜尋錯誤
grep "ERROR" rag_web_backend/logs/app.log

# 查看容器 log（包含啟動訊息）
docker logs -f rag_backend
```
 更新程式碼

```bash
# 後端：修改代碼後需重啟（代碼已掛載，即時同步）
docker restart rag_backend

# 後端：修改依賴或 Dockerfile 需重新建置
docker compose up -d --build backend

# 前端：重新建置
docker compose up -d --build admin query

```bash
docker compose up -d --build
```

### 進入容器

```bash
# 進入後端容器
docker exec -it rag_backend bash

# 進入資料庫（使用 .env 中的設定）
docker exec -it rag_postgres psql -U postgres -d rag_db

# 檢查資料庫連線
docker exec rag_postgres pg_isready -U postgres
```

### 資料庫管理

```bash
# 執行 Migration
docker exec -it rag_backend alembic upgrade head

# 重置資料庫（開發用）
docker exec -it rag_backend python scripts/reset_db.py
連接資料庫
docker exec -it rag_postgres psql -U postgres -d rag_db
```

### 資料庫操作

```bash
# 執行 Migration
docker exec -it rag_backend alembic upgrade head

# 重置資料庫
doc日誌系統

### 檔案位置
- 本地：`./rag_web_backend/logs/app.log`
- 容器：`/app/logs/app.log`
- 配置：`app/core/logging_config.py`

### 查看日誌

```bash
# 即時查看
tail -f rag_web_backend/logs/app.log

# 搜尋錯誤
grep "ERROR" rag_web_backend/logs/app.log

# 查看特定時間
grep "2025-12-25 13:" rag_web_backend/logs/app.log
```

### 特性
- ✅ 台灣時間 UTC+8（格式：`2025-12-25 13:09:07`）
- ✅ 容器重啟自動清空
- ✅ 同時輸出到容器和本地檔案
- ✅ 包含應用啟動、API請求、錯誤等所有日誌

## 檔案掛載說明

後端 Volume 掛載（雙向即時同步）：
- `./rag_web_backend/uploads:/app/uploads` - 上傳檔案（持久化）
- `./rag_web_backend/logs:/app/logs` - 應用日誌（重啟重置）
- `./rag_web_backend/app:/app/app` - 程式碼（修改後需重啟）

## 環境變數

編輯 `.env` 後重啟服務：
```bash
docker restart rag_backend
- API 文件: http://localhost:8889/docs
- 健康檢查: http://localhost:8889/api/health
- PostgreSQL: localhost:5434

> 注意：如需修改端口，請編輯 `.env` 中的 `NGINX_PORT` 和 `POSTGRES_PORT`

## 訪問地址

- 查詢介面: http://localhost/query
- 管理介面: http://localhost/admin
- API 文件: http://localhost/docs
- 健康檢查: http://localhost/api/health
常見問題

### 服務無法啟動
```bash
docker compose ps              # 檢查狀態
docker logs rag_backend        # 查看錯誤
curl http://localhost:8889/api/health  # 健康檢查
```