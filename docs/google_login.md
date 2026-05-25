# Google 登入完整串接指南

本文說明如何從零完成 Google OAuth 登入的設定，涵蓋 Google Cloud 設定、專案環境變數、以及系統實作細節。

---

## 目錄

1. [Google Cloud 設定](#1-google-cloud-設定)
2. [專案環境變數](#2-專案環境變數)
3. [部署指令](#3-部署指令)
4. [驗證是否成功](#4-驗證是否成功)
5. [系統實作說明](#5-系統實作說明)
6. [常見問題](#6-常見問題)

---

## 1. Google Cloud 設定

### 1.1 建立專案（若已有可略）

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 點右上角「Select a project」→「New Project」
3. 填入專案名稱，建立後切換到該專案

### 1.2 設定 OAuth 同意畫面

1. 左側選單 → **APIs & Services** → **OAuth consent screen**
2. User Type 選擇：
   - **Internal**：僅限 Google Workspace 組織帳號（例如 `@ncku.edu.tw`），不需審核，建議校內使用
   - **External**：任何 Google 帳號皆可登入，需要審核才能正式開放
3. 填寫必填欄位：
   - App name（例：`NCKU RAG 系統`）
   - User support email
   - Developer contact information
4. Scopes 頁面：只需預設的 `openid`、`email`、`profile`，不需額外新增
5. 若 User Type 為 External 且狀態為 **Testing**，需在「Test users」加入測試用的 Google 帳號

### 1.3 建立 OAuth Client ID

1. 左側選單 → **APIs & Services** → **Credentials**
2. 點「**+ Create Credentials**」→「**OAuth client ID**」
3. Application type 選「**Web application**」
4. Name 填一個識別名稱（例：`rag-web-app`）
5. **Authorized JavaScript origins** 加入（必填）：

   | 環境 | 填入的 Origin |
   |---|---|
   | 正式主機 | `http://aidemo.ncku.edu.tw:8888` |
   | 本機開發 | `http://localhost:8889` |

   > 注意：只需要 scheme + domain + port，不需要路徑（`/admin`、`/query` 等）

6. **Authorized redirect URIs**：本專案使用 Google Identity Services（GSI）的 popup 模式，**不需要填寫 redirect URI**
7. 點「Create」，記下畫面上顯示的 **Client ID**（格式：`xxxxxx.apps.googleusercontent.com`）

> **重要**：本專案只需要 **Client ID**，不需要 Client Secret。

---

## 2. 專案環境變數

編輯專案根目錄的 `.env` 檔案（非 `.env.example`）：

```env
# Google OAuth
VITE_GOOGLE_CLIENT_ID=你的-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=你的-client-id.apps.googleusercontent.com
```

兩個變數填相同的值：

| 變數 | 用途 |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | 前端（React）渲染 Google 登入按鈕，在 build 時注入 |
| `GOOGLE_CLIENT_ID` | 後端（FastAPI）驗證 Google 回傳的 ID Token |

---

## 3. 部署指令

```bash
# 後端重建（讀取新 env）
docker compose up -d --build backend

# 前端重建（注入 VITE 環境變數）
./update-frontend.sh
```

---

## 4. 驗證是否成功

### 前端
前往 `http://aidemo.ncku.edu.tw:8888/query/{處室slug}/login/google`

- ✅ 應看到 Google 官方登入按鈕
- ❌ 若顯示「尚未設定 Google Client ID」→ 前端 env 未生效，重跑 `./update-frontend.sh`

### 後端
呼叫 `POST /api/query-auth/google-login`

- ✅ 正常處理 → 回傳 `access_token`
- ❌ 回 503「Google 登入尚未啟用」→ 後端 `GOOGLE_CLIENT_ID` 沒讀到，重跑 `docker compose up -d --build backend`

### 後台資料
Google 登入者**不會**出現在管理後台的「查詢用戶管理」頁面（這是預期行為）。

---

## 5. 系統實作說明

### 5.1 登入流程

```
用戶點擊 Google 登入按鈕（GoogleLoginPage.jsx）
  ↓
前端載入 Google Identity Services SDK
  ↓
Google 返回 id_token（JWT）
  ↓
POST /api/query-auth/google-login { id_token: "..." }
  ↓
後端用 google.oauth2 驗證 id_token
  ↓
後端建立系統內部 JWT（type: "query_google"）
  ↓
前端儲存 token，登入完成
```

### 5.2 Token 類型區別

系統有兩種查詢端 token：

| type | 用途 | id |
|---|---|---|
| `query_user` | 一般帳號密碼登入 | DB 的 `query_users.id` |
| `query_google` | Google OAuth 登入 | `None`（不存在於 DB） |

### 5.3 身分驗證中介層（`get_current_query_user`）

位於 `app/core/security.py`。

收到請求時解碼 JWT，依 `type` 欄位分流：

- `query_google` → 從 payload 取出 email/name，建立 `GoogleSessionUser`（in-memory，不查 DB）
- `query_user` → 從 DB 查 `QueryUser`，檢查狀態是否 APPROVED 且 active

### 5.4 RAG 查詢權限邏輯

位於 `app/api/rag.py`，Google 用戶（`current_user.id is None`）的可查詢檔案範圍：

```
允許查詢的檔案 = 公開檔案
              + 「Google登入」身分組被授權的檔案
              + 「其他」分類的所有檔案
```

一般登入用戶的範圍：

```
允許查詢的檔案 = 公開檔案
              + 個人被授權的檔案
              + 所屬身分組被授權的檔案
              + 「其他」分類的所有檔案
```

### 5.5 「Google登入」身分組

每個處室啟用 Google 登入方式後，系統會自動建立名為 `Google登入` 的身分組（在 `_sync_default_login_groups`）。管理員可在後台「設定檔案身分組權限」中，將檔案授權給這個身分組，凡是 Google 登入的用戶都能查詢。

### 5.6 相關程式碼位置

| 功能 | 檔案 |
|---|---|
| Google 登入 API | `app/api/query_auth.py` → `POST /query-auth/google-login` |
| Token 驗證與 `GoogleSessionUser` | `app/core/security.py` → `get_current_query_user` |
| RAG 查詢權限判斷 | `app/api/rag.py` → `query_documents` |
| 前端登入頁 | `rag_web_query/src/pages/GoogleLoginPage.jsx` |
| 前端 API 呼叫 | `rag_web_query/src/services/queryAuth.js` → `loginWithGoogleToken` |
| 身分組自動建立 | `app/api/departments.py` → `_sync_default_login_groups` |

---

## 6. 常見問題

### Google 登入按鈕跳出「accounts.google.com refused to connect」

OAuth Client ID 的 Authorized JavaScript origins 沒有加入當前主機的 origin（`http://aidemo.ncku.edu.tw:8888`）。

### 登入後問答一直顯示「系統發生錯誤」

後端 `GOOGLE_CLIENT_ID` 未設定，導致 token 驗證失敗。確認 `.env` 已填值並重跑 `docker compose up -d --build backend`。

### Google 登入用戶查不到特定檔案

1. 確認該檔案在後台「設定檔案身分組權限」中勾選了「Google登入」身分組
2. 確認處室的登入方式設定有啟用 Google 登入（這樣才會有 `Google登入` 身分組）

### 本機測試無法使用 Google 登入（`localhost` 被擋）

在 Google Cloud OAuth Client ID 的 Authorized JavaScript origins 加入 `http://localhost:8889`（或你本機的 port）。

### 想限制只有特定 Google 帳號可以登入

目前系統不限制，所有有效 Google 帳號都可登入。若要限制只有 `@ncku.edu.tw`，需在 `app/api/query_auth.py` 的 `google_login` 函式加上 email domain 驗證：

```python
if not email.endswith("@ncku.edu.tw"):
    raise HTTPException(status_code=403, detail="僅限 NCKU 帳號登入")
```
