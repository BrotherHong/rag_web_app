# 開發指引

## Commit 規範

格式：`<type>: <中文描述>`

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修復 bug |
| `refactor` | 重構（不影響功能） |
| `chore` | 設定、依賴、腳本等雜項 |
| `docs` | 文件更新 |
| `test` | 測試相關 |

- 保持代碼簡潔，避免冗餘
- 移除確定不用的舊代碼
- 更新時整個換新，不要同時保留新舊代碼（除非當下場景明確需要兼容）
- 註解僅保留必要/重要的，不要太冗長

## 常用指令

### 後端重啟
```bash
# 快速重啟（代碼修改）
docker compose restart backend

# 重新建置（依賴/Dockerfile 修改）
docker compose up -d --build backend

# 查看日誌
docker compose logs -f backend
```

### 前端更新
```bash
# 更新 query 和 admin 頁面
./update-frontend.sh
```

## 資料庫資訊
```
Host: localhost
Port: 5433
Database: rag_db
User: postgres
Password: postgres123
```

## 架構說明
- **Backend**: FastAPI (Python) - `rag_web_backend/`
- **Admin**: React (Vite) - `rag_web_admin/`
- **Query**: React (Vite) - `rag_web_query/`
- **Nginx**: 反向代理
- **PostgreSQL**: 資料庫

## 測試

```bash
docker compose exec backend pytest tests/        # 一般測試

# E2E 測試（可選，需要 Ollama 服務，約 1-3 分鐘）
docker compose exec backend pytest tests/test_rag_pipeline.py -v -s -m slow
```

- 新增或修改業務邏輯時，視情況補充對應測試（以有實際驗證意義為主，避免只測 401/200 等基礎行為）
- 修改 API 行為後重跑一次全部測試確認無誤

## 文件維護（`docs/`）

修改程式碼後，若涉及以下情況則需同步更新 `docs/` 對應文件：

**需要更新：**
- 新增或移除功能
- 重要流程邏輯異動（上傳 pipeline、RAG 查詢、身分驗證流程）
- 資料模型欄位新增/變更（DB schema、API request/response 格式）
- 架構異動（新增/移除服務、容器、目錄結構）
- 環境變數新增

**不需要更新：**
- Bug fix（行為未變）
- 純重構（介面與流程不變）
- UI 樣式調整
- 測試、腳本、CI 相關異動

**對應關係：**
- 後端 API / 流程 / 模型 → `docs/architecture.md` 或 `docs/admin.md`
- RAG 查詢邏輯 → `docs/query.md` 及 `docs/architecture.md`（AI Pipeline 節）
- 前台功能 / 頁面 → `docs/query.md`
- 管理後台功能 → `docs/admin.md`