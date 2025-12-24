# RAG Knowledge Base

成大知識庫問答系統 - 基於 RAG (Retrieval-Augmented Generation) 的智能問答平台

## 專案架構

```
RAG_web/
├── rag_web_backend/    # FastAPI 後端
├── rag_web_admin/      # React 管理介面
├── rag_web_query/      # React 查詢介面
├── nginx/              # 反向代理配置
├── docker-compose.yml  # Docker 編排配置
└── .env         # 環境變數設定
```

## 快速開始

### 1. 環境設定

```bash
# 複製環境變數範本
cp .env.example .env

# 編輯 .env，修改以下項目：
# - JWT_SECRET_KEY（用 openssl rand -hex 32 生成）
# - POSTGRES_PASSWORD
# - SUPER_ADMIN_PASSWORD
# - OLLAMA_BASE_URL
```

### 2. 首次啟動

```bash
# 建置並啟動所有服務
docker-compose up -d --build
```

### 3. 訪問服務

- **查詢介面**: http://localhost/query
- **管理介面**: http://localhost/admin
- **API 文件**: http://localhost/docs
- **健康檢查**: http://localhost/api/health

### 4. 預設帳號

- 帳號: `superadmin`
- 密碼: `.env` 中的 `SUPER_ADMIN_PASSWORD`

---

## Docker 常用指令

### 基本操作

```bash
# 啟動所有服務（背景執行）
docker-compose up -d

# 停止所有服務
docker-compose down

# 重新啟動所有服務
docker-compose restart

# 重新啟動特定服務
docker-compose restart backend
docker-compose restart nginx
```

### 查看狀態與日誌

```bash
# 查看所有容器狀態
docker-compose ps

# 即時查看所有日誌
docker-compose logs -f

# 查看特定服務日誌
docker-compose logs -f backend
docker-compose logs -f admin
docker-compose logs -f query
```

### 程式碼修改後更新

#### 後端 Python 代碼修改
```bash
# 只需重啟（不用重新建置）
docker-compose restart backend
```

#### 前端代碼修改或依賴更新
```bash
# 需要重新建置
docker-compose up -d --build admin
docker-compose up -d --build query
```

#### 後端依賴更新 (requirements.txt)
```bash
# 需要重新建置
docker-compose up -d --build backend
```

#### Nginx 配置修改
```bash
# 重新建置並重啟
docker-compose up -d --build nginx
```

### 資料庫管理

```bash
# 只重啟服務（保留資料庫）
docker-compose down
docker-compose up -d

# 完全重置（⚠️ 會刪除所有資料）
docker-compose down -v
docker-compose up -d --build
```

```bash
# 停止資料庫初始化（已有資料時）
# 編輯 .env，設定：
INIT_DB=false
INIT_SYSTEM_SETTINGS=false

# 然後重啟
docker-compose restart backend
```

### 進入容器除錯

```bash
# 進入後端容器
docker-compose exec backend sh

# 進入資料庫容器
docker-compose exec postgres psql -U postgres -d rag_db

# 查看容器內檔案
docker-compose exec backend ls -la /app/uploads
```

### 清理資源

```bash
# 停止並移除容器
docker-compose down

# 停止並移除容器 + 網路
docker-compose down --remove-orphans

# 停止並移除所有（包含 volume）
docker-compose down -v

# 清理未使用的 Docker 資源
docker system prune -a
```

---

## 常見問題

### Q1: 首次啟動失敗？

**檢查清單**:
1. `.env` 是否正確設定
2. JWT_SECRET_KEY 是否已修改（不能是預設值）
3. Ollama URL 是否可訪問
4. 端口 80 是否被佔用

```bash
# 查看詳細錯誤
docker-compose logs backend
```

### Q2: 修改代碼後沒有生效？

**後端**: 只需 `docker-compose restart backend`  
**前端**: 需要 `docker-compose up -d --build admin` 或 `query`  
**Nginx**: 需要 `docker-compose up -d --build nginx`

### Q3: 如何重置資料庫？

```bash
# ⚠️ 會刪除所有資料
docker-compose down -v
docker-compose up -d --build
```

### Q4: 如何停止資料庫自動初始化？

編輯 `.env`:
```env
INIT_DB=false
INIT_SYSTEM_SETTINGS=false
```

### Q5: 容器無法連接到資料庫？

```bash
# 檢查資料庫是否健康
docker-compose ps
docker-compose logs postgres

# 重啟後端（會等待資料庫就緒）
docker-compose restart backend
```

---

## 技術棧

**後端**:
- Python 3.12
- FastAPI
- PostgreSQL 15
- SQLAlchemy + asyncpg
- Alembic (資料庫遷移)

**前端**:
- React 19
- Vite 7
- TailwindCSS 4

**基礎設施**:
- Docker & Docker Compose
- Nginx (反向代理)
- Ollama (LLM 服務)

---

## 開發團隊

國立成功大學 - RAG Knowledge Base Team
