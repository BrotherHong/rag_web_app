# Google 登入串接操作手冊（Query 系統）

本文件整理目前專案中 Google 登入相關程式碼、Google Cloud 設定流程、以及未來拿到正式網域後需要完成的事項。

## 1. 目前已完成的程式碼

### 後端（FastAPI）
- 新增 Google 登入 API：`POST /api/query-auth/google-login`
- 流程：
  1. 後端驗證 Google ID Token
  2. 建立 `query_google` 類型的 JWT session token
  3. 回傳登入資訊
- 設計重點：
  - **不建立 QueryUser 資料列**
  - 所以不會出現在後台「查詢用戶管理」中

相關檔案：
- `rag_web_backend/app/api/query_auth.py`
- `rag_web_backend/app/core/security.py`
- `rag_web_backend/app/schemas/query_user.py`
- `rag_web_backend/app/config.py`
- `rag_web_backend/requirements.txt`
- `rag_web_backend/pyproject.toml`

### 前端（Query React）
- `GoogleLoginPage` 已接 Google Identity Services 按鈕流程
- 前端取得 credential 後會呼叫後端 `/api/query-auth/google-login`
- 成功後儲存 query token，並回到原頁

相關檔案：
- `rag_web_query/src/pages/GoogleLoginPage.jsx`
- `rag_web_query/src/services/queryAuth.js`

### 容器與環境變數注入
- `docker-compose.yml`
- `nginx/Dockerfile`
- `.env.example`
- `rag_web_backend/.env.example`

---

## 2. Google Cloud 一步一步設定

## 2.1 建立專案（若已有可略）
1. 進入 Google Cloud Console
2. 建立新專案（或選既有專案）

## 2.2 設定 OAuth 同意畫面
1. 進入「APIs & Services」->「OAuth consent screen」
2. 選擇 User Type（通常 External）
3. 填寫 App name、Support email、Developer contact
4. 若狀態是 Testing，請將測試帳號加入 Test users

## 2.3 建立 OAuth Client ID（Web）
1. 進入「APIs & Services」->「Credentials」
2. 點「Create Credentials」->「OAuth client ID」
3. Application type 選「Web application」
4. 在 **Authorized JavaScript origins** 加入你的網站來源（必填）
   - 例如：`https://your-domain.example`
   - 本機測試可加：`http://localhost:8889`
5. 建立後取得 Client ID（格式類似 `xxxx.apps.googleusercontent.com`）

注意：
- 本專案目前只需要 **Client ID**，不需要 Client Secret
- 若你使用的是 IP 位址而非合規網域，Google 可能不允許設定 origin

---

## 3. 專案要填的環境變數

在專案根目錄 `.env`（實際運行檔，不是 `.env.example`）填入：

```env
GOOGLE_CLIENT_ID=你的-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=你的-client-id.apps.googleusercontent.com
```

兩者目前建議填同一個值：
- `GOOGLE_CLIENT_ID`：後端驗證 ID Token
- `VITE_GOOGLE_CLIENT_ID`：前端渲染 Google 登入按鈕

---

## 4. 拿到正式網域後要做的事情（Checklist）

1. 確定可對外連線的正式網域（建議 HTTPS）
2. 將正式來源加入 Google Cloud 的 Authorized JavaScript origins
3. 更新專案 `.env`：
   - `GOOGLE_CLIENT_ID`
   - `VITE_GOOGLE_CLIENT_ID`
4. 重建後端（安裝與載入最新 env）
5. 重建前端（注入最新 VITE 變數）
6. 實測 Google 登入

建議指令：

```bash
docker compose up -d --build backend
./update-frontend.sh
```

---

## 5. 驗證是否啟用成功

## 5.1 後端檢查
- 若 `GOOGLE_CLIENT_ID` 沒填，呼叫 `/api/query-auth/google-login` 會回 503（預期行為）
- 填好後應可正常處理 token

## 5.2 前端檢查
- 進入 `/query/login/google`
- 應看到 Google 官方登入按鈕
- 登入成功後，導回原頁並顯示已登入狀態

## 5.3 後台資料檢查
- Google 登入者 **不應該** 出現在「查詢用戶管理」

---

## 6. 常見問題排查

### 問題 1：Google 按鈕出不來
可能原因：
- `VITE_GOOGLE_CLIENT_ID` 沒有設定
- 前端未重建
- 網域 origin 不在 Google Cloud 白名單

### 問題 2：登入跳錯誤（origin not allowed）
可能原因：
- 目前網址（含 protocol + port）未加入 Authorized JavaScript origins

### 問題 3：後端回 503
可能原因：
- `GOOGLE_CLIENT_ID` 尚未設定或空值

---

## 7. 未來可擴充項目（目前尚未做）

1. 限制只允許特定網域信箱（例如 `@ncku.edu.tw`）
2. Google 登入後綁定部門預設權限
3. 為 Google session 增加更細緻的授權策略
4. 完整 E2E 自動化測試（含前端流程）

---

## 8. 變更備註

這份文件對應的是「Google 可登入 Query，但不寫入 QueryUser 管理資料」的版本。
若日後改成 Google 登入也要進查詢用戶管理，後端資料模型與流程需再調整。
