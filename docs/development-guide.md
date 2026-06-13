# 功能開發指南

> 以功能為導向的交接文件，按前端頁面分類，讓接手者快速找到對應程式碼位置與實作要點。
> 部署與啟動方式請參考 `DOCKER_GUIDE.md`。

---

## 目錄

- [1. 專案架構總覽](#1-專案架構總覽)
- [2. Admin 後台](#2-admin-後台)
- [3. Query 前台](#3-query-前台)
- [4. Super Admin](#4-super-admin)

---

## 1. 專案架構總覽

### 技術棧

| 層級 | 技術 |
|------|------|
| 前端 Admin | React + Vite + Tailwind CSS |
| 前端 Query | React + Vite + Tailwind CSS |
| 後端 | FastAPI (Python) |
| 資料庫 | PostgreSQL + pgvector |
| LLM | LiteLLM（支援 OpenAI / Ollama 等多家） |
| Reranker | 獨立 GPU 推論服務（可選遠端 API） |
| 反向代理 | Nginx |

### 目錄對應

```
rag_web_admin/src/
├── components/        ← 各頁面元件（按側欄對應）
├── services/api/      ← API 呼叫模組（按功能分檔）
└── contexts/          ← Toast 等全域 Context

rag_web_query/src/
├── pages/             ← 各頁面
├── components/        ← 聊天介面元件
├── contexts/          ← Auth Context
└── services/          ← API 呼叫

rag_web_backend/app/
├── api/               ← 18 個 router 模組（按功能分檔）
├── services/          ← 業務邏輯
│   ├── rag/           ← RAG 引擎核心
│   ├── llm/           ← LLM 整合
│   └── document_processing/  ← 文件處理
├── models/            ← SQLAlchemy 資料模型
├── core/              ← 權限、限流、設定
└── schemas/           ← Pydantic 請求/回應格式
```

### 權限架構（三層角色）

| 角色 | 說明 | 登入入口 |
|------|------|----------|
| `SUPER_ADMIN` | 跨部門管理，可操作所有部門 | Admin 後台 |
| `ADMIN` | 部門管理員，僅能操作自己部門 | Admin 後台 |
| `Query User` | 終端查詢使用者 | Query 前台 |

**認證機制**：JWT (HS256)，Admin 和 Query User 使用不同的 OAuth2 scheme。

**部門隔離**：所有資料（檔案、分類、使用者群組）都以 `department_id` 隔離，Admin 只能看到自己部門的資料。Super Admin 可透過 `X-Proxy-Department-Id` header 切換部門。

---

## 2. Admin 後台

> 前端：`rag_web_admin/src/components/`
> 後端 API prefix：`/api/v1/`

### 2.1 登入

| | 路徑 |
|--|------|
| 前端 | `components/Login.jsx` |
| 後端 | `app/api/auth.py` |

- 帳號密碼登入，回傳 JWT token 存 localStorage
- 登入後根據角色（`ADMIN` / `SUPER_ADMIN`）導向不同 Dashboard
- Token 過期時間由 `.env` 的 `JWT_EXPIRE_MINUTES` 控制

### 2.2 儀表板

| | 路徑 |
|--|------|
| 前端 | `components/Dashboard.jsx` → 內部 `DashboardHome` |
| 後端 | `app/api/statistics.py`, `app/api/activities.py` |

顯示部門統計數據（檔案數、查詢數、儲存空間）和近期活動紀錄。純讀取，無特殊邏輯。

### 2.3 知識庫管理

| | 路徑 |
|--|------|
| 前端 | `components/KnowledgeBase.jsx` |
| 後端 | `app/api/files.py` |

瀏覽已上傳的檔案，支援搜尋、按分類/群組篩選、分頁（20筆/頁）。可編輯檔案的分類與權限，或刪除檔案。標準 CRUD。

### 2.4 檔案上傳 ⭐

| | 路徑 |
|--|------|
| 前端 | `components/UploadFiles.jsx` |
| 後端 | `app/api/upload.py` |
| 服務 | `app/services/file_processor.py`, `app/services/document_processing/` |

#### 前端 4 步驟 Wizard：

1. **選擇檔案** — 拖曳或選取，指定分類與使用者群組
2. **重複檢查** — 比對同部門下是否有同名檔案（含不同副檔名，如 `Q&A.pdf` 會與 `Q&A.docx` 衝突）。有衝突時**無法直接覆蓋**，必須先到知識庫刪除舊檔再重新檢查；若舊檔屬於其他管理組織則需聯絡對應管理員
3. **上傳中** — 即時顯示每個檔案的處理進度
4. **結果摘要** — 顯示成功/失敗統計

#### 後端上傳流程：

```
POST /upload/batch
  → 產生 task_id (UUID)
  → 逐檔處理：驗證格式 → 儲存檔案 → 寫入 DB → 建立群組權限
  → 狀態存在 memory dict（30 分鐘後自動清除）

GET /upload/progress/{task_id}
  → 前端 polling 取得每個檔案的即時狀態與進度 (0-100%)
```

- 每個檔案獨立 commit，一個失敗不影響其他
- 進度追蹤為 **in-memory dict + polling**（非 WebSocket）
- task 不在 memory 時（如重啟），fallback 查詢 `UploadBatch` DB 記錄

#### 文件處理 Pipeline（`file_processor.py` 四階段）：

上傳完成後自動觸發，四階段各佔 25% 進度：

```
1. Prepare (0-25%)   — 判斷檔案類型
2. Convert (25-50%)  — 轉換為 Markdown
3. Summarize (50-75%) — LLM 摘要 + 切 chunk
4. Embed (75-100%)   — 產生 embedding 存入 vector DB
```

#### 文件轉換（`document_processing/document_converter.py`）：

| 檔案類型 | 轉換工具 |
|----------|----------|
| PDF | **MinerU**（CLI: `mineru -p <file> -o <dir> -m auto`，timeout 10 分鐘，強制 CPU） |
| DOC | LibreOffice 轉 DOCX → MarkItDown |
| DOCX, XLSX | **MarkItDown** |

支援格式：`.pdf`, `.doc`, `.docx`, `.xlsx`, `.xls`（上限 10MB）

#### Chunking 策略（`document_processing/summarizer.py`）：

```python
chunk_size = 950 字元
overlap = 150 字元
trigger = 1500 字元（超過才切 chunk）
```

- 優先在 **段落分隔** (`\n\n`) 處切割
- 其次在 **句號** (`。`) 處切割
- 每個 chunk 獨立產生摘要（LLM）與 embedding
- 文件會先分類為「資訊型」或「表單型」，使用不同摘要 prompt

#### Embedding（`document_processing/embedding_processor.py`）：

- 模型：由 `OLLAMA_EMBEDDING_MODEL` 環境變數指定（通常為 BGE 系列）
- 透過 LiteLLM Router 呼叫，支援多 Ollama host 負載均衡
- 產出：每個 chunk 一個 embedding JSON，存入 pgvector

#### 處理後的檔案結構：
```
uploads/{dept_id}/{file_id}/
├── data/          ← 原始上傳檔
├── output_md/     ← 轉換後的 Markdown
├── summaries/     ← 各 chunk 摘要 JSON
└── embeddings/    ← 各 chunk embedding JSON
```

### 2.5 查詢使用者管理

| | 路徑 |
|--|------|
| 前端 | `components/QueryUserManagement.jsx` |
| 後端 | `app/api/query_users.py` |

管理終端查詢使用者的 CRUD（建立、編輯、停用/啟用、刪除）。可將使用者加入群組以控制可存取的檔案範圍。

### 2.6 查詢分析

| | 路徑 |
|--|------|
| 前端 | `Dashboard.jsx` 內部 `QueryAnalytics` 區塊 |
| 後端 | `app/api/statistics.py`, `app/api/rag.py`（no-result 分析） |

三個子功能：
- **無結果洞察** — 篩選 `QueryHistory` 中無結果的紀錄，用 embedding 計算語意相似度（閾值 0.84）進行**聚類**，將類似問題歸為同一群。可選用 LLM 為每個群產生代表性標題。後端：`app/services/rag/no_result_analyzer.py`
- **熱門查詢** — 對 `QueryHistory` 依正規化後的 query 文字做 COUNT 聚合，按次數排序取 Top 10
- **查詢歷史** — 直接查詢 `QueryHistory` table，支援文字搜尋、日期範圍篩選、分頁

### 2.7 FAQ 管理 & 助理設定

| | 路徑 |
|--|------|
| 前端 | `Dashboard.jsx` 內部 `FaqManagement` 區塊 |
| 後端 | `app/api/faqs.py`（FAQ）、`app/api/departments.py`（助理設定） |

兩個 Tab：
- **助理設定** — 自訂助理名稱、系統 prompt、招呼語圖片
- **FAQ 管理** — 新增/編輯/刪除常見問答，支援拖曳排序與啟用/停用

FAQ 會顯示在 Query 前台聊天介面的側欄作為快速提問。

### 2.8 部門設定 ⭐

| | 路徑 |
|--|------|
| 前端 | `Dashboard.jsx` 內部 `DepartmentSettings` 區塊 |
| 後端 | `app/api/categories.py`, `app/api/user_groups.py` |

三個 Tab：

#### 分類管理
檔案的分類標籤（如「法規」「表單」），用於知識庫篩選和 Query 前台的分類查詢。

#### 使用者群組（存取控制）⭐

檔案權限的核心機制：

```
QueryUser ←(多對多)→ UserGroup ←(多對多)→ File
```

- 上傳檔案時指定可存取的群組
- 查詢時只搜尋使用者所屬群組有權限的檔案
- RAG 引擎的 `allowed_filenames` 參數實現 vector search 過濾
- 後端：`FileUserGroupPermission` model 存放檔案-群組關聯

**預設身分組**：系統會依部門啟用的登入方式自動建立對應群組（`_sync_default_login_groups()`）：
- `一般登入` — 透過帳號密碼註冊的查詢用戶
- `Google登入` — 透過 Google OAuth 登入的用戶
- `成功入口登入` — 透過成功入口 SSO 登入的用戶

Session 用戶（Google / 成功入口）查詢時，後端會自動依其登入方式對應到相應的預設群組，取得該群組的檔案存取權限。

#### 登入方式設定
設定該部門的 Query 前台支援哪些登入方式（可多選）：
- `normal` — 帳號密碼（使用查詢用戶的帳號登入）
- `google` — Google OAuth（無需預先建立帳號）
- `success_portal` — 成功入口 SSO（無需預先建立帳號）

啟用/停用登入方式時，系統會自動同步建立或保留對應的預設身分組。

---

## 3. Query 前台

> 前端：`rag_web_query/src/`
> 後端 API prefix：`/api/v1/query-auth/`（認證）、`/api/v1/rag/`（查詢）

**路由結構**：所有頁面以 `/:deptSlug` 為 base URL（多部門共用同一前端，透過 slug 區分）。

### 3.1 首頁

| | 路徑 |
|--|------|
| 前端 | `pages/HomePage.jsx` |

Landing page，顯示部門名稱、助理名稱、功能介紹卡片。點「開始使用」導向登入。無特殊邏輯。

### 3.2 登入流程

| | 路徑 |
|--|------|
| 前端 | `pages/LoginMethodSelectPage.jsx`, `pages/LoginPage.jsx`, `pages/GoogleLoginPage.jsx`, `pages/SuccessPortalLoginPage.jsx` |
| 後端 | `app/api/query_auth.py` |

#### 流程：
1. `LoginMethodSelectPage` — 根據部門設定的 `login_methods` 動態顯示可用登入方式
2. 使用者選擇後導向對應頁面：
   - **Normal**：帳號密碼 → 後端驗證 → 回傳 JWT
   - **Google**：載入 Google SDK → ID Token → 後端驗證 → 回傳 JWT
   - **成功入口**：導向後端 → 後端重導 NCKU ADFS → callback 帶 JWT 回前端

#### 特性：
- Auth 狀態由 `QueryAuthContext` 管理（token + user 存 localStorage）
- `RequireQueryAuth` wrapper 保護聊天頁面，未登入自動導向登入頁
- 登入後導回原本要去的頁面（透過 `location.state.from`）

### 3.3 聊天介面 ⭐

| | 路徑 |
|--|------|
| 前端 | `pages/ChatPage.jsx`, `components/` 下的聊天元件 |
| 後端 | `app/api/rag.py`, `app/services/rag/rag_engine.py` |

#### 介面結構：
- **側欄**：快速提問（FAQ）列表 + 新對話按鈕
- **主區域**：對話訊息流 + 底部輸入區

#### 輸入區特性：
- 分類篩選下拉選單（限定搜尋範圍）
- 700 字上限，超過 600 字顯示警告
- Enter 送出 / Shift+Enter 換行

#### RAG 查詢流程（後端 `RAGEngine.query()`）：

```
使用者提問
  → 過濾 allowed_filenames（依使用者群組權限決定可搜尋的檔案範圍）
  → Vector Search（pgvector 相似度搜尋，取 top-250 候選，閾值 0.1）
  → Rerank（呼叫 Reranker API 對候選重新排序，過濾低於 0.01 的結果）
  → 取 top-3 → 去重（同一檔案多個 chunk 合併）
  → 組建 Context（將 top-3 文件內容建構為 Markdown 上下文）
  → LLM 生成回答（LiteLLM，支援多 host 負載均衡）
  → 回傳答案 + 引用來源
```

#### 回應顯示特性：
- 引用來源：顯示檔案名稱 + 下載按鈕
- URL 自動偵測並轉為可點擊連結
- 「直接詢問 AI」按鈕 — 當 RAG 無結果時可繞過知識庫直接問 LLM（需後端啟用 `enable_direct_query`）
- 招呼語支援圖片（可點擊放大）

### 3.4 忘記密碼

| | 路徑 |
|--|------|
| 前端 | `pages/ForgotPasswordPage.jsx` |
| 後端 | `app/api/query_auth.py` |

兩步驟流程：輸入帳號 → 後端產生重設碼 → 輸入重設碼 + 新密碼。
重設碼需由管理員從後台轉發給使用者（無寄信機制）。

---

## 4. Super Admin

> 前端：`rag_web_admin/src/components/SuperAdminDashboard.jsx` + `components/superadmin/`
> 與一般 Admin 共用後端 API，但 Super Admin 可透過 `X-Proxy-Department-Id` 操作任意部門。

| 頁面 | 功能 | 後端 |
|------|------|------|
| 全域總覽 | 跨部門統計、各部門查詢量 | `app/api/statistics.py` |
| 部門管理 | 新增/編輯/刪除部門、設定部門登入方式、管理 Admin Group | `app/api/departments.py`, `app/api/admin_groups.py` |
| 使用者管理 | 管理所有 Admin 帳號、指派部門與 Admin Group | `app/api/users.py` |
| 活動紀錄 | 全系統活動日誌、可按部門篩選 | `app/api/activities.py` |

Super Admin 登入後會看到獨立的 Dashboard（非一般 Admin 的側欄），四個頁面以 tab 切換。

---

## 附錄：常用檔案速查

| 要改什麼 | 去哪裡找 |
|----------|----------|
| API 路由註冊 | `backend/app/api/__init__.py` |
| 資料庫 Model | `backend/app/models/` |
| DB Migration | `backend/alembic/versions/` |
| LLM Prompt | `backend/app/services/llm/prompts/` |
| 環境變數 | `.env`（參考 `backend/app/config.py`） |
| Nginx 設定 | `nginx/nginx.conf` |
| 前端 API 呼叫 | `admin/src/services/api/` 或 `query/src/services/` |
| 前端路由 | 各自的 `App.jsx` |
