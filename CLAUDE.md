# CLAUDE.md

成大處室 RAG 問答系統。管理端上傳／向量化文件，查詢端讓使用者以自然語言問答並取得帶來源的答案。

## 系統組成

| 服務 | 技術 | 路徑 | 說明 |
|------|------|------|------|
| Backend | FastAPI (Python) | `rag_web_backend/` | API、RAG、認證、文件處理 |
| Reranker | 獨立 GPU 推論 | `rag_web_backend/reranker_server.py` | rerank API，本地走 GPU、遠端走外部 API |
| Celery | Celery + Redis | `rag_web_backend/app/tasks/` | 非同步文件處理／向量化 |
| Admin | React (Vite) | `rag_web_admin/` | 管理後台 |
| Query | React (Vite) | `rag_web_query/` | 使用者查詢前台 |
| Nginx | 反向代理 | `nginx/` | 對外入口，含 `/reranker/` 代理 |
| DB | PostgreSQL | — | 主資料庫（本機 `localhost:5433`） |

後端服務層 `app/services/`：`rag/`（檢索問答引擎）、`llm/`（LLM client 與 prompt 模板）、`document_processing/`（解析、切塊、向量化）。

## 架構與資料流

- **上傳側**：Admin 上傳 → Celery 非同步處理（`services/document_processing/`：解析 → 切塊 → 向量化）→ 檔案標記 `is_vectorized`。
- **查詢側**：Query 前台 → `app/api/rag.py` → `services/rag/rag_engine.py`：依身分過濾可存取檔案 → 向量檢索 → Reranker 重排 → 去重合併 → LLM 生成（`services/llm/`）→ 回傳答案與來源。
- **認證**：`app/core/security.py` 依 JWT `type` 區分一般查詢帳號（入庫 `QueryUser`）與 session 登入（Google／成功入口，不入庫）；身分決定可存取檔案與來源呈現方式。

深入某一塊前，先循 API（`app/api/`）→ 服務層（`app/services/`）→ 模型（`app/models/`）的分層找到對應位置。

## 慣例

### Commit
格式 `<type>: <中文描述>`，type：`feat` / `fix` / `refactor` / `chore` / `docs` / `test`。

### 程式碼
- **以整體設計思考，不各處打補丁**：動手前先看既有的資料流與抽象，順著它擴充；同一行為的邏輯集中在一處，避免散落多點各自判斷。修 bug 時找根因，而非在末端補條件。
- 保持簡潔、避免冗餘，移除確定不用的舊代碼。
- 更新時整段換新，不同時保留新舊（除非明確需要相容）。
- 註解僅保留必要／重要者，不要冗長。

## 常用指令

```bash
# 後端：改代碼快速重啟 / 改依賴重建 / 只改 .env / 看日誌
docker compose restart backend
docker compose up -d --build backend
docker compose up -d backend
docker compose logs -f backend

# 服務啟動：本地含 GPU reranker / 遠端無 GPU（.env 設 RERANKER_API_URL）
docker compose --profile gpu up -d
docker compose up -d

# 前端更新（query + admin）
./update-frontend.sh
```

資料庫（本機）：`localhost:5433` / `rag_db` / `postgres` / `postgres123`。

## 測試

```bash
docker compose exec backend pytest tests/                                   # 一般
docker compose exec backend pytest tests/test_rag_pipeline.py -v -s -m slow # E2E（需 Ollama，1-3 分）
```

- 新增／改業務邏輯時視情況補測試，以有實際驗證意義為主（避免只測 401/200）。
- 改 API 行為後重跑全部測試確認無誤。

## 文件維護（`docs/`）

**需同步更新**：新增／移除功能、重要流程異動（上傳 pipeline、RAG 查詢、認證流程）、資料模型／API 格式變更、架構異動、新增環境變數。
**不需更新**：行為未變的 bug fix、純重構、UI 樣式、測試／腳本／CI。

目前 `docs/`：`development-guide.md`（開發總覽）、`google_login.md`、`success_portal_login.md`（兩種 session 登入）、`admin_group.md`（身分組權限）。改到對應主題時更新該檔；涉及新主題再新增文件。
