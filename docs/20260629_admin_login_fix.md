# 2026-06-29 管理後台登入問題修復紀錄

## 問題

新 server 上管理後台的初始 `superadmin` 無法登入。前端送出登入請求後，後端回應失敗。

排查後確認：

- `superadmin` 帳號存在於資料庫中。
- `superadmin` 角色為 `SUPER_ADMIN`。
- 帳號狀態為啟用。
- 問題不是帳號不存在，也不是帳號被停用。

後端日誌中的主要錯誤為：

```text
asyncpg.exceptions.InvalidPasswordError: password authentication failed for user "postgres"
```

也就是 backend 在處理登入時，無法使用目前設定連上 PostgreSQL。

## 根因

### 1. PostgreSQL role 密碼與 compose 設定不同步

PostgreSQL 的資料存在 Docker named volume 中。`POSTGRES_PASSWORD` 只會在資料庫 volume 第一次初始化時生效；如果之後只修改 `.env` 或只手動修改 PostgreSQL 內的 role 密碼，兩邊就可能不同步。

當 backend 需要重新建立資料庫連線時，例如：

- backend container 重啟
- PostgreSQL container 重啟
- SQLAlchemy connection pool 回收舊連線
- 服務閒置後重新連線

backend 會使用目前 compose 展開後的 `DATABASE_URL` 密碼連線。如果該密碼和 PostgreSQL 內實際 `postgres` role 密碼不同，就會登入失敗。

### 2. shell 環境變數 `DEBUG=release` 覆蓋 `.env`

這台 server 的 shell 環境中存在：

```text
DEBUG=release
```

原本 `docker-compose.yml` 使用：

```yaml
DEBUG: ${DEBUG:-False}
```

Docker Compose 變數展開時，shell 環境變數優先權高於 `.env`，所以 container 內實際拿到的是：

```text
DEBUG=release
```

但後端 `app/config.py` 將 `DEBUG` 定義為 boolean，因此重建 backend 後會啟動失敗：

```text
DEBUG
  Input should be a valid boolean, unable to interpret input
```

### 3. nginx 在 backend 重建後仍可能指向舊 container IP

backend 重建後 container IP 可能改變。nginx 已經運行多日，可能仍使用舊 upstream 位址，導致外部 `/api` 暫時打不到新的 backend。

因此 backend 重建後需要重啟 nginx，讓它重新解析 `backend` 服務名稱。

## 已執行的修復

### 1. 同步 PostgreSQL role 密碼

將 PostgreSQL 內 `postgres` role 密碼同步為目前 `.env` 中的 `POSTGRES_PASSWORD`。

```bash
docker exec rag_postgres psql -U postgres -d rag_db -c "ALTER USER postgres WITH PASSWORD '目前 .env 的 POSTGRES_PASSWORD';"
```

注意：實際密碼不應寫入文件或 commit。

### 2. 重建會連線資料庫的服務

```bash
docker compose up -d --force-recreate backend celery_worker flower
```

### 3. 重啟 nginx

```bash
docker compose restart nginx
```

### 4. 避免外部 `DEBUG` 污染 compose 設定

將 `docker-compose.yml` 中 backend 與 celery worker 的 debug 設定由：

```yaml
DEBUG: ${DEBUG:-False}
```

改為：

```yaml
DEBUG: ${APP_DEBUG:-False}
```

並在 `.env.example` 與目前 server 的 `.env` 補上：

```env
APP_DEBUG=False
```

這樣即使 shell 中存在 `DEBUG=release`，也不會影響 container 內的後端設定。

### 5. 修正 celery worker 與 flower healthcheck

原本 celery worker 與 flower 會沿用 backend image 的 healthcheck，檢查：

```text
http://localhost:8000/api/health
```

但 celery worker 不提供 HTTP 服務，flower 則跑在 `5555`，因此會被誤判為 unhealthy。

已改為：

- celery worker：使用 `celery inspect ping`
- flower：檢查 `http://localhost:5555/`

## 驗證結果

已完成以下驗證：

```text
GET  /admin/          -> 200
GET  /api/health      -> 200
POST /api/auth/login  -> 200
```

`docker compose ps` 顯示：

- `rag_backend`：healthy
- `rag_celery_worker`：healthy
- `rag_flower`：healthy
- `rag_nginx`：healthy
- `rag_postgres`：healthy
- `rag_redis`：running

## 後續維運建議

## 2026-07-02 復發原因補充

幾天後再次發生 `superadmin` 無法登入，backend 日誌仍是：

```text
asyncpg.exceptions.InvalidPasswordError: password authentication failed for user "postgres"
```

再次排查後確認：

- `superadmin` 帳號仍存在且啟用。
- backend 與 compose 展開後仍使用同一組 `DATABASE_URL`。
- `DEBUG` 已是 `False`，不是前次的 shell env 覆蓋問題。
- PostgreSQL 內部 `postgres` role 密碼再次與 backend 使用的密碼不同步。

更重要的是，當時 `docker compose ps` 顯示 PostgreSQL 對外暴露：

```text
0.0.0.0:5432->5432/tcp
```

PostgreSQL 日誌也出現來自外部掃描或非正常連線的跡象，例如：

```text
invalid length of startup packet
unsupported frontend protocol
password authentication failed for user "postgres"
```

因此這次復發的高度可能原因是：**PostgreSQL 5432 port 暴露在公網上，外部掃描或連線嘗試持續打進來；若使用預設或弱密碼，攻擊者有機會登入並修改 `postgres` role 密碼。**

### 已追加修復

將 `docker-compose.yml` 的 PostgreSQL port mapping 從對外公開：

```yaml
ports:
  - "${POSTGRES_PORT:-5432}:5432"
```

改為只綁定本機：

```yaml
ports:
  - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"
```

套用後重新建立 PostgreSQL container：

```bash
docker compose up -d --force-recreate postgres
```

再重建依賴 DB 的服務與 nginx：

```bash
docker compose up -d --force-recreate backend celery_worker flower nginx
```

驗證結果：

```text
rag_postgres: 127.0.0.1:5432->5432/tcp
POST /api/auth/login -> 200
```

### 安全建議

即使目前登入已恢復，因為 PostgreSQL 曾經暴露在公網上，建議後續仍應：

- 更換 `POSTGRES_PASSWORD`，不要使用預設密碼。
- 同步更新 `.env` 與 PostgreSQL role 密碼。
- 確認防火牆或 security group 不允許外部連入 `5432`。
- 正式環境若不需要 host 直接連 DB，可完全移除 `postgres.ports`。

### 修改 PostgreSQL 密碼時

不要只改 `.env`，也不要只改 PostgreSQL role。兩邊必須同步。

建議流程：

```bash
# 1. 修改 .env 中的 POSTGRES_PASSWORD

# 2. 同步 PostgreSQL role 密碼
docker exec rag_postgres psql -U postgres -d rag_db -c "ALTER USER postgres WITH PASSWORD '新的 POSTGRES_PASSWORD';"

# 3. 重建會連 DB 的服務
docker compose up -d --force-recreate backend celery_worker flower

# 4. 重啟 nginx，避免 upstream 指到舊 backend container IP
docker compose restart nginx
```

### 重建 backend 時

建議同時執行：

```bash
docker compose up -d --force-recreate backend celery_worker flower
docker compose restart nginx
```

### 長期改善

正式環境建議建立專用資料庫使用者，例如 `rag_app`，避免 backend 使用 PostgreSQL superuser `postgres`。這可以降低密碼漂移與人工操作造成的風險。
