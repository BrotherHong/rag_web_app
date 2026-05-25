# 成功入口登入重新導入指南

本文給後續接任者使用。成功入口（NCKU ADFS SSO）的程式已經接在系統內，重新部署或換主機時通常不需要改 code，只要向成功入口管理端申請/確認 OAuth 設定，並把三個環境變數填進 `.env`。

---

## 1. 需要向成功入口管理端取得的資料

請向成功入口/ADFS OAuth 管理窗口申請或確認此系統的 OAuth client，並取得以下三項：

| `.env` 變數 | 成功入口端對應欄位 | 說明 |
|---|---|---|
| `PORTAL_CLIENT_ID` | `client_id` | 成功入口核發的 OAuth Client ID，通常是 UUID 格式 |
| `PORTAL_CLIENT_SECRET` | `client_secret` | 成功入口核發的系統代碼/密鑰 |
| `PORTAL_REDIRECT_URI` | `redirect_uri` | 成功入口登入完成後回打本系統的 callback URL |

本專案目前使用的成功入口端點已寫在後端程式中：

| 用途 | URL |
|---|---|
| 授權頁 | `https://fs.ncku.edu.tw/adfs/oauth2/authorize` |
| 換 token | `https://fs.ncku.edu.tw/adfs/oauth2/token` |
| 登出 | `https://fs.ncku.edu.tw/adfs/oauth2/logout` |

---

## 2. Redirect URI 要填什麼

`PORTAL_REDIRECT_URI` 必須是後端 callback：

```env
PORTAL_REDIRECT_URI=http://你的網域或IP:對外port/api/query-auth/portal-callback
```

正式範例：

```env
PORTAL_REDIRECT_URI=http://aidemo.ncku.edu.tw:8888/api/query-auth/portal-callback
```

注意事項：

- 這個值要和成功入口管理端登記的 `redirect_uri` 完全一致，包含 `http/https`、網域、port、路徑。
- 後端會用同一個 `PORTAL_REDIRECT_URI` 當作 ADFS authorize request 的 `redirect_uri` 和 `resource`。
- 如果對外入口換成 HTTPS 或 port 改變，成功入口端也要同步更新白名單/登記值。
- `nginx/nginx.conf` 有處理 ADFS 回到根路徑 `/` 且帶 `?code=` 的情境，會轉送到 `/api/query-auth/portal-callback`；正常情況仍建議直接登記上面的 callback URL。

---

## 3. 專案 `.env` 設定

編輯專案根目錄的 `.env`，填入成功入口核發的資料：

```env
# 成功入口（NCKU ADFS SSO）登入
PORTAL_CLIENT_ID=成功入口核發的-client-id
PORTAL_CLIENT_SECRET=成功入口核發的-client-secret
PORTAL_REDIRECT_URI=http://aidemo.ncku.edu.tw:8888/api/query-auth/portal-callback
```

這三個變數只給後端使用，不需要新增 `VITE_PORTAL_*` 前端變數。

---

## 4. 部署方式

因為變數是由 `docker-compose.yml` 傳給 backend container，填完 `.env` 後重建後端：

```bash
docker compose up -d --build backend
```

如果同時換了前端或 nginx 靜態檔，也可以照專案既有部署流程更新前端：

```bash
./update-frontend.sh
```

單純補成功入口三個 env 時，重建 backend 通常就夠。

---

## 5. 登入流程對照

```text
使用者在查詢端選擇「成功入口登入」
  ↓
前端導向 GET /api/query-auth/portal-login?from_path=...
  ↓
後端用 PORTAL_CLIENT_ID + PORTAL_REDIRECT_URI 組出 ADFS authorize URL
  ↓
成功入口登入完成後回打 PORTAL_REDIRECT_URI，帶回 code/state
  ↓
後端用 code + PORTAL_CLIENT_SECRET 向 ADFS token endpoint 換 access_token
  ↓
後端解出 commonname/email/fullname/DN/identity，建立系統內部 JWT
  ↓
後端導回 /query/login/portal-callback?token=...&from=...
  ↓
前端儲存 token，完成登入
```

目前成功入口登入者不會建立 `QueryUser` 資料表記錄，系統會用 session-only user 的方式授權，並依照「成功入口登入」身分組套用權限。

---

## 6. 驗證是否成功

### 後端 env 是否讀到

進入登入頁後點「成功入口登入」：

- 成功：瀏覽器會被導向 `https://fs.ncku.edu.tw/adfs/oauth2/authorize...`
- 失敗且回 503「成功入口登入尚未啟用」：`PORTAL_CLIENT_ID` 或 `PORTAL_REDIRECT_URI` 沒有被 backend 讀到，檢查 `.env` 並重跑 `docker compose up -d --build backend`

### Callback 是否正常

成功入口登入後：

- 成功：會回到 `/query/login/portal-callback`，接著導回原本要看的查詢頁
- 失敗且回 400「無法從成功入口取得 token」：通常是 `PORTAL_CLIENT_SECRET` 錯誤，或 `PORTAL_REDIRECT_URI` 與成功入口端登記值不一致
- 失敗且回 400「成功入口 token 格式錯誤」或「未返回有效 token」：成功入口回傳格式異常，需確認該 OAuth client 是否可正常取得 access token

---

## 7. 相關程式位置

| 檔案 | 用途 |
|---|---|
| `rag_web_backend/app/config.py` | 定義 `PORTAL_CLIENT_ID`、`PORTAL_CLIENT_SECRET`、`PORTAL_REDIRECT_URI` |
| `rag_web_backend/app/api/query_auth.py` | 成功入口 login/callback/logout 主流程 |
| `rag_web_backend/app/core/security.py` | 建立與解析成功入口登入後的系統內部 JWT |
| `rag_web_query/src/pages/SuccessPortalLoginPage.jsx` | 前端成功入口登入按鈕，導向後端 `/portal-login` |
| `rag_web_query/src/pages/PortalCallbackPage.jsx` | 前端接收後端回傳的系統 token |
| `nginx/nginx.conf` | 處理 ADFS callback 帶 `?code=` 回到根路徑時的轉送 |
| `cheng_kung_portal/` | 原始成功入口 PHP 範例與參考資料 |

