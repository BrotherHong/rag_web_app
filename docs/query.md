# 查詢前台功能說明

## 1. 系統概覽

查詢前台（`http://localhost/query`）是提供給一般使用者的聊天介面，使用者透過自然語言向各處室的知識庫提問，系統使用 RAG 流程尋找相關文件並由 LLM 生成回答。

每個處室有獨立入口：`/query/{slug}`，例如：
- `/query/hr` → 人事室
- `/query/accounting` → 會計室

---

## 2. 路由結構

```
/                         → 重新導向到 /hr（預設處室）
/:deptSlug                → 處室首頁（HomePage）
/:deptSlug/chat           → 聊天頁（需登入）
/login                    → 登入（帳號密碼）
/login-select             → 登入方式選擇頁
/register                 → 自助註冊
/forgot-password          → 忘記密碼
/404                      → 找不到頁面
```

查詢系統的 Token 與 Admin 系統分開存儲（`localStorage.query_token`），兩套登入互不干擾。

---

## 3. 登入流程

### 3.1 登入方式選擇頁

進入 `/:deptSlug` 後點擊登入，顯示該處室允許的登入方式（由後端 `login_methods` 設定）。

### 3.2 帳號密碼登入

```
使用者輸入帳號（username 或 email）+ 密碼
  ↓
POST /api/query-auth/login
  ↓
後端驗證、回傳 JWT token + 使用者資訊
  ↓
儲存至 localStorage.query_token、localStorage.query_user
  ↓
重新導向至 /:deptSlug/chat
```

### 3.3 Google 登入

```
點擊 Google 登入按鈕
  ↓
動態載入 Google Sign-In SDK
  ↓
Google 回傳 id_token
  ↓
POST /api/query-auth/google-login { id_token: "..." }
  ↓
後端驗證 token，找到或建立對應的 QueryUser
  ↓
回傳系統 JWT token，後續流程同帳號密碼登入
```

> 注意：Google 登入不在資料庫建立 QueryUser 記錄。後端用 `google-auth` 庫驗證 id_token，提取 `sub`（全局唯一 ID）+ email，論證通過後發行一個以 `google:{sub}` 為號的號物 JWT，庌端次請求用此 token。需在 `.env` 設定 `GOOGLE_CLIENT_ID`。

### 3.4 忘記密碼流程

```
步驟 1：輸入帳號
  └─ POST /api/query-auth/forgot-password { username: "..." }
  └─ 後端生成 8 碼 reset token，儲存在 QueryUser.reset_token
  └─ （現行實作：token 直接顯示在 API 回應，需另外設計寄信邏輯）

步驟 2：輸入 Token + 新密碼
  └─ POST /api/query-auth/reset-password { token: "ABCD1234", new_password: "..." }
  └─ 後端驗證 token，更新密碼，清除 token
```

### 3.5 自助註冊

```
使用者填寫：帳號、Email、密碼、姓名（選填：單位、申請原因）
  ↓
POST /api/query-auth/register
  ↓
建立 QueryUser（status = APPROVED，直接可用）
  ↓
重新導向到登入頁
```

---

## 4. 聊天頁面（ChatPage）

### 4.1 頁面佈局

- **左側欄（可收起）**：常見問題清單（來自 FAQ）、新對話按鈕、返回首頁
- **主區域**：對話訊息串流
- **底部**：輸入框 + 分類篩選下拉選單 + 送出按鈕

### 4.2 分類篩選

使用者可在輸入框旁選擇分類，將 RAG 搜尋範圍限縮到特定分類的文件：
- 預設：搜尋所有分類
- 選擇分類後：只在該分類的文件中搜尋

---

## 5. RAG 查詢完整流程（核心功能）

### 5.1 前端發送

```javascript
// 使用者送出問題後
POST /api/rag/query
{
  "query": "請假規定有哪些？",
  "scope_ids": [1],           // 當前處室 ID（由 DepartmentContext 自動帶入）
  "category_ids": [5]         // 若有選擇分類（否則不帶此欄位）
}
```

### 5.2 後端權限過濾

在 RAG 搜尋前，後端先決定此使用者「可以存取哪些文件」：

```python
允許的文件 = 公開文件（is_public=True）
           + 使用者身分組可存取的文件
```

若使用者選擇了分類，再進一步過濾到該分類內的檔名。

### 5.3 向量搜尋（VectorStore）

```
1. 對使用者問題呼叫 Ollama embedding API，生成查詢向量
2. 從磁碟讀取此處室所有文件的 embedding.json（有快取，重啟後重建）
3. 只保留「允許的文件」中的向量
4. 計算查詢向量與每份文件向量的 cosine 相似度
5. 過濾相似度 < 0.1 的文件
6. 取相似度最高的前 250 份文件
```

### 5.4 Reranking（Reranker）

```
1. 對每份候選文件，組成 (查詢, 文件摘要) 配對
2. 用 CrossEncoder（BAAI/bge-reranker-v2-m3）對每對評分
   └─ 這個步驟執行在本機 GPU/CPU，比向量相似度更精準
3. 過濾分數 < 0.01 的文件
4. 按分數降序排序，取前 3 份文件
```

### 5.5 生成回答（LiteLLM）

```
1. 讀取前 3 份文件的完整原文（從 summary.json 取得 original_content）
   └─ 同一文件的多個 chunk 會合併為單一文件
2. 組成 RAG Prompt：
   「請根據以下文件回答問題：
    文檔1（檔名1）：...內容...
    文檔2（檔名2）：...內容...
    問題：{query}」
3. 透過 LiteLLMClient 呼叫 Ollama（多主機負載平衡）
4. 回傳 LLM 生成的回答
```

### 5.6 回傳格式

**有找到相關文件：**
```json
{
  "question": "請假規定有哪些？",
  "answer": "根據人事規則第三條...",
  "sources": [
    {
      "filename": "人事規則.pdf",
      "download_link": "/api/public/files/42/download",
      "score": 0.87
    }
  ],
  "retrieved_docs": 18,
  "used_for_answer": 2
}
```

**未找到相關文件：**
```json
{
  "question": "...",
  "answer": "很抱歉，我沒有找到與您問題相關的資料...",
  "sources": [],
  "retrieved_docs": 0
}
```

### 5.7 前端顯示

- 回答顯示在左側泡泡
- 若有 `sources`，顯示「參考資料（N 份文件）」可展開，每份文件有下載按鈕
- 若 `sources` 為空（未找到），顯示「改以 AI 通用知識回答（僅供參考）」按鈕（觸發直接查詢）

---

## 6. 直接查詢（Direct Query Fallback）

當 RAG 未找到相關文件時，使用者可選擇繞過知識庫，直接讓 LLM 用本身知識回答：

```
點擊「改以 AI 通用知識回答（僅供參考）」
  ↓
POST /api/rag/direct-query
{
  "query": "原始問題",
  "scope_ids": [1]
}
  ↓
後端直接呼叫 LLM（不做向量搜尋）
  ↓
前端顯示回答，標注「(使用本地模型直接回覆)」
若處室有設定外部 API Key，則標注「(使用外部模型直接回覆)」
```

---

## 7. 檔案下載

`GET /api/public/files/{file_id}/download` 不需登入，任何人可透過 file_id 下載原始檔案。

---

## 8. 處室脈絡（DepartmentContext）

所有查詢頁面共用 `DepartmentContext`，從 URL slug 自動載入處室資訊（名稱、主題色、FAQ）並設定 CSS 變數 `--dept-color`。全域 API client 自動帶入 `department_id`。若 slug 不存在，顯示 404 頁面並列出所有可用處室連結。
