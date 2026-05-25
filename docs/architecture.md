# 系統架構與部署說明

## 1. 系統概覽

本系統是基於 RAG（Retrieval-Augmented Generation）的多處室知識庫問答平台，供成功大學各處室部署給使用者進行智能問答。系統分為兩個入口：

- **管理後台**（`rag_web_admin`）：各處室管理員上傳知識庫文件、管理使用者與設定系統
- **查詢前台**（`rag_web_query`）：一般使用者透過自然語言向處室知識庫提問

---

## 2. 系統元件

系統由五個 Docker 容器組成：

```
┌─────────────────────────────────────────────────────┐
│                     Nginx (port 80)                  │
│  /admin → rag_web_admin    /query → rag_web_query   │
│  /api   → backend          /docs  → FastAPI Swagger  │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   backend:8000    postgres:5432  redis:6379
   (FastAPI +       (資料庫)      (Celery broker)
    Celery worker)
```

| 容器 | 用途 | 技術 |
|------|------|------|
| `nginx` | 反向代理，整合所有服務 | Nginx |
| `backend` | API 服務 + Celery worker | FastAPI + Python |
| `postgres` | 關聯式資料庫 | PostgreSQL |
| `redis` | Celery task queue + SSE pub/sub | Redis |
| *(外部)* | LLM 推論服務 | Ollama（可多台） |

> **注意**：Celery worker 與 FastAPI server 執行在同一個 container，共用同一份程式碼。

---

## 3. 技術架構

### 後端
- **FastAPI** — 非同步 REST API
- **SQLAlchemy (async)** — ORM，使用 `asyncpg` driver
- **Alembic** — 資料庫 migration 管理
- **Celery** — 非同步任務佇列（處理檔案向量化）
- **LiteLLM** — 多台 Ollama 主機負載平衡

### 前端
- **React + Vite** — 兩個獨立前端應用
- **Tailwind CSS** — 樣式框架
- **LocalStorage** — Token 與狀態持久化

### AI Pipeline
- **Embedding**：透過 Ollama embedding API（預設 `bge-m3`）
- **LLM**：透過 LiteLLMClient 呼叫 Ollama
  - `litellm.Router` 管理所有主機，每台主機注冊 `text-generation` 和 `bge-embedding` 兩個模型入口
  - routing_strategy: `simple-shuffle`（隨機分配），num_retries=1，timeout=90s
  - 每次 LLM 回應後透過 `opencc`（`s2t` 模式）將簡體字轉為繁體，避免不同 Ollama 主機回應簡體
- **RAG 排序**：先用向量相似度找出候選文檔，再直接依相似度排序取前幾筆
  - 輸入為查詢向量與文件向量，輸出 cosine similarity 分數
  - `RAGEngine` 以 process-level dict `_dept_rag_engines` 按處室快取，上傳新檔後清除對應處室的快取

---

## 4. 目錄結構

```
rag_web_app/
├── docker-compose.yml
├── nginx/
│   └── nginx.conf
├── rag_web_backend/
│   ├── app/
│   │   ├── api/           # API 路由（每個功能一個檔案）
│   │   ├── core/          # security, logging, database 設定
│   │   ├── models/        # SQLAlchemy ORM 模型
│   │   ├── schemas/       # Pydantic 請求/回應格式
│   │   ├── services/
│   │   │   ├── rag/       # RAGEngine, VectorStore, NoResultAnalyzer
│   │   │   ├── llm/       # LiteLLMClient
│   │   │   └── document_processing/  # 文件轉換、摘要、向量化
│   │   └── tasks/         # Celery tasks（file_pipeline）
│   ├── alembic/           # 資料庫 migration 腳本
│   └── uploads/           # 上傳檔案與向量化產物（掛載為 Docker volume）
├── rag_web_admin/src/     # 管理後台前端
└── rag_web_query/src/     # 查詢前台前端
```

---

## 5. 資料庫模型

### 核心關聯

```
Department (處室)
  ├── User[]           (管理員帳號)
  ├── Category[]       (知識庫分類)
  ├── File[]           (知識庫文件)
  ├── UserGroup[]      (身分組)
  ├── FAQ[]            (常見問題)
  ├── QueryHistory[]   (查詢紀錄)
  └── Activity[]       (操作日誌)

QueryUser (查詢使用者)
  └── UserGroup[] (多對多)

File
  └── UserGroup[] (多對多，控制存取權限)
```

### 主要模型欄位

**User**（管理員帳號，用於後台登入）
| 欄位 | 說明 |
|------|------|
| `role` | `SUPER_ADMIN` / `ADMIN` / `USER` |
| `department_id` | 所屬處室（super_admin 為 null） |
| `is_active` | 帳號是否啟用 |

**QueryUser**（查詢使用者，用於前台登入）
| 欄位 | 說明 |
|------|------|
| `status` | `PENDING` / `APPROVED` / `REJECTED` / `SUSPENDED` |
| `default_department_id` | 預設處室 |
| `reset_token` | 忘記密碼 token（8碼） |

**File**（知識庫文件）
| 欄位 | 說明 |
|------|------|
| `status` | `PENDING` / `PROCESSING` / `COMPLETED` / `FAILED` |
| `is_vectorized` | 是否已完成向量化 |
| `is_public` | 是否對所有使用者開放（不受身分組限制） |
| `embedding_path` | 向量檔案路徑 |
| `markdown_path` | 轉換後的 Markdown 路徑 |
| `summary_path` | 摘要 JSON 路徑 |

**Department**（處室）
| 欄位 | 說明 |
|------|------|
| `slug` | URL 識別碼，如 `hr`、`accounting` |
| `login_methods` | JSON 陣列，如 `["normal", "google"]` |
| `external_api_key` | 外部 LLM API Key（可選） |
| `color` | 處室主題色 |

---

## 6. 認證系統

系統有**兩套完全獨立**的 JWT 認證，共用同一組後端 API：

| | 管理員系統 | 查詢使用者系統 |
|--|----------|-------------|
| 登入端點 | `POST /api/auth/login` | `POST /api/query-auth/login` |
| Token 儲存 | `localStorage.token` | `localStorage.query_token` |
| 使用者資訊 | `localStorage.user` | `localStorage.query_user` |
| 角色 | `SUPER_ADMIN` / `ADMIN` / `USER` | 無角色，依 status 控管 |

### 管理員角色說明

| 角色 | 權限 |
|------|------|
| `SUPER_ADMIN` | 全系統管理（處室、管理員帳號、全域統計） |
| `ADMIN` | 所屬處室的所有管理功能 |
| `USER` | 目前未使用（保留） |

### Super Admin Proxy 模式

Super Admin 可在請求 header 加入 `X-Proxy-Department-Id: {dept_id}`，暫時以指定處室管理員身份操作，方便支援各處室問題。前台會在 localStorage 保存原始帳號資訊，切換時不需重新登入。

---

## 7. 檔案儲存結構

上傳的文件與向量化產物存放於 `uploads/` 目錄，按處室 ID 分隔：

```
uploads/
└── {department_id}/
    ├── {filename}.pdf          # 原始上傳檔案
    └── processed/
        ├── embeddings/
        │   └── {filename}_embedding.json   # 向量資料
        └── summaries/
            └── {filename}_summary.json     # 原文內容與 metadata
```

**embedding.json 格式：**
```json
{
  "filename": "..._embedding.json",
  "original_filename": "人事規則.pdf",
  "summary_length": 320,
  "doc_type": "Info Mode",
  "embedding": [0.12, -0.34, ...],
  "embedding_dim": 1024
}
```

**summary.json 格式：**
```json
{
  "filename": "..._summary.json",
  "summary": "文件摘要文字...",
  "summary_length": 320,
  "doc_type": "Info Mode",
  "original_content": "全文文字內容..."
}
```

> RAG 查詢時，VectorStore 將 `embeddings/` 下所有 `*_embedding.json` 全部載入記憶體並快取。生成回答時，從 `summary.json` 取 `original_content` 作為傳送給 LLM 的上下文。

---

## 8. 環境變數設定

複製 `.env.example` 為 `.env` 後修改以下必填項：

| 變數 | 說明 | 範例 |
|------|------|------|
| `JWT_SECRET_KEY` | JWT 簽名金鑰，需隨機生成 | `openssl rand -hex 32` |
| `DATABASE_URL` | PostgreSQL 連線字串 | `postgresql+asyncpg://...` |
| `SUPER_ADMIN_PASSWORD` | 初始 super admin 密碼 | |
| `OLLAMA_BASE_URL` | 第一台 Ollama 主機 | `http://192.168.1.10:11434` |
| `OLLAMA_BASE_URL_2` ~ `_5` | 額外 Ollama 主機（選填） | |
| `OLLAMA_RAG_MODEL` | RAG 回答用 LLM | `gemma3:27b` |
| `OLLAMA_SUMMARY_MODEL` | 摘要生成用 LLM | `ggemma3:27b` |
| `OLLAMA_EMBEDDING_MODEL` | Embedding 模型 | `bge-m3` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID（選填） | |

---

## 9. 部署流程

### 首次部署

```bash
cp .env.example .env
# 編輯 .env 填入必要設定

docker compose up -d --build
# 啟動後自動執行 alembic migration 與 super admin 初始化
```

### 日常操作

```bash
# 程式碼修改後重啟（不需重 build）
docker compose restart backend

# 依賴或 Dockerfile 修改後
docker compose up -d --build backend

# 查看即時日誌
docker compose logs -f backend

# 前端更新
./update-frontend.sh
```

### 資料庫 Migration

```bash
# 進入 container
docker compose exec backend bash

# 執行 migration
alembic upgrade head
```

### 資料庫連線資訊（開發環境）
- Host: `localhost`
- Port: `5433`
- Database: `rag_db`
- User: `postgres`
- Password: `postgres123`
