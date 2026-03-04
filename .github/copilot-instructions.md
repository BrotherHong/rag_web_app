# 開發指引

## 編碼原則
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
