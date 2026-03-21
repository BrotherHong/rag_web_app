# 測試說明

## 執行方式

```bash
# 一般測試（在 container 內執行）
docker compose exec backend pytest tests/

# E2E 測試（需要 Ollama 服務，約 1-5 分鐘）
docker compose exec backend pytest tests/test_rag_pipeline.py -v -s -m slow
```

## 測試檔案

| 檔案 | 說明 |
|------|------|
| `test_auth.py` | 登入、登出、token 驗證 |
| `test_departments.py` | 處室的 CRUD 操作 |
| `test_users.py` | 使用者的 CRUD 操作、權限控管 |
| `test_faqs.py` | FAQ 的 CRUD 操作 |
| `test_public.py` | 公開 API（處室列表、FAQ 查詢） |
| `test_query_users.py` | 查詢使用者管理 |
| `test_rag_pipeline.py` | E2E：上傳檔案 → Ollama 處理 → RAG 查詢 |

## 注意事項

- 測試使用獨立的 `rag_db_test` 資料庫，不影響正式資料
- E2E 測試標記為 `@pytest.mark.slow`，預設不執行，需明確加 `-m slow`
- E2E 測試需要 PrimeHub Ollama 服務可用
