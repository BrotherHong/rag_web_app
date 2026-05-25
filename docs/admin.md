# 管理後台功能說明

## 1. 系統概覽

管理後台（`http://localhost/admin`）提供兩種角色：

| 角色 | 進入頁面 | 功能範圍 |
|------|----------|---------|
| **Super Admin** | `/super-admin` | 全系統管理：建立處室、管理所有管理員帳號、查看全域統計 |
| **處室 Admin** | `/dashboard` | 所屬處室的知識庫管理、使用者管理、設定 |

---

## 2. Super Admin 功能

### 2.1 處室管理

可建立、編輯、刪除處室。每個處室是一個獨立的知識庫單位。

**重要欄位說明：**
- **Slug**：URL 識別碼（英文小寫），決定查詢前台入口路徑，例如 `hr` 對應 `http://localhost/query/hr`
- **主題色**：顯示在查詢前台的品牌色彩（8 色可選）
- **登入方式**：設定該處室允許哪些登入方式（至少一種）
  - `normal`：帳號密碼登入
  - `google`：Google OAuth 登入
  - `success_portal`：成功入口（NCKU ADFS SSO）登入
- **外部 API Key**：設定後，該處室的 LLM 查詢會改用外部 API（OpenAI 相容格式），而非本地 Ollama

### 2.2 管理員帳號管理

建立隸屬於特定處室的管理員帳號（`ADMIN` 角色）。管理員只能管理自己處室的資源。

Super Admin 可在此頁編輯自己的姓名、Email 與密碼；密碼欄位留空時不變更原密碼。其他 Super Admin 帳號不可由非本人代為編輯。

### 2.3 活動記錄（全域）

跨處室統計（依時間範圍篩選）及操作審計日誌，Super Admin 可依處室過濾。

---

## 3. 處室 Admin 功能

### 3.1 知識庫管理

列表顯示本處室所有已上傳的文件，功能包含：
- 搜尋（檔名）、依分類篩選
- 分頁（每頁 20 筆）
- 查看文件詳情（上傳者、大小、處理狀態、向量化資訊）
- 變更文件分類
- 刪除文件（同時刪除磁碟上的原始檔與所有向量化產物）
- 下載原始文件
- 設定文件的**身分組存取權限**

---

### 3.2 批次上傳檔案（重要功能）

批次上傳採非同步處理，分四個步驟：

```
步驟 1：選擇檔案
  └─ 拖放或點選，支援 .pdf / .docx / .txt
  └─ 每個檔案可指定：分類、要授權存取的身分組

步驟 2：重複檔案檢查
  └─ 呼叫 POST /api/upload/check-duplicates
  └─ 後端比對已存在的檔名，回傳重複清單
  └─ 使用者可選擇移除重複或繼續上傳

步驟 3：進度追蹤（即時更新）
  └─ 呼叫 POST /api/upload/batch 建立批次任務
     └─ 回傳 batch_id
  └─ 開啟 SSE 連線訂閱 GET /api/batches/{batch_id}/events
     └─ 若 SSE 不支援則 fallback 至輪詢 GET /api/upload/progress/{batch_id}
  └─ 每個檔案有獨立的處理進度：
       classify (0%) → extract (25%) → chunk (50%) → embed (75%) → summarize (100%)
  └─ 支援取消：
       取消整批：POST /api/batches/{batch_id}/cancel
       取消單檔：POST /api/batches/{batch_id}/files/{file_id}/cancel
       （注意：embed/summarize 步驟中無法取消，避免產物不一致）
  └─ batch_id 存入 localStorage，重整頁面可恢復進度追蹤

步驟 4：結果摘要
  └─ 顯示成功 / 失敗 / 取消的檔案清單與錯誤原因
```

#### 後端處理流程（Celery）

```
POST /api/upload/batch
  ↓
為每個檔案建立 UploadBatch + UploadBatchItem 記錄（DB）
  ↓
觸發 Celery task：process_single_file_task(file_id, batch_id)
  ↓
取得 Redis 鎖（避免同一 file_id 並發重複處理）
  ↓
[Step 1] DocumentConverter：轉檔為 Markdown
  ├─ PDF → mineru CLI（subprocess），輸出目錄下找新產生的 .md
  │      mineru 指定 -m auto -b pipeline -d cpu（強制 CPU，避免不必要的資源競爭）
  │      timeout 10 分鐘；mineru 寫檔有延遲，最多 poll 15 秒等待
  ├─ DOCX／其他 → MarkItDown 函式庫直接轉換
  └─ .doc → 先用 LibreOffice（soffice --headless）轉為 .docx，再走 MarkItDown
  ↓
[Step 2] SummaryProcessor：用 LLM 生成摘要 → summary.json
  1. 先以前 2000 字呼叫 LLM 分類文件類型：
     - Info Mode（一般資訊文件）
     - Form Mode（表單／表格為主）
  2. 將 Markdown 內容去除 HTML 標籤（<tag> → 空白）、壓縮多餘空白
  3. 長度 ≤ 1500 字：直接送 LLM 生成摘要
     長度 > 1500 字：分塊處理（chunk_size=950, overlap=150），
                     每塊個別摘要，再彙整出一份全文摘要
  4. 輸出 summary.json（含 summary、doc_type、original_content）
  ↓
[Step 3] EmbeddingProcessor：對 summary.json 中的 summary 文字呼叫
  Ollama embedding API（透過 LiteLLMClient），產生向量 → embedding.json
  ↓
更新 DB：File.status = COMPLETED、is_vectorized = True
  ↓
清除本處室 RAGEngine in-memory 快取（下次查詢時自動重新從磁碟載入新向量）
  ↓
透過 Redis pub/sub 發布進度事件 → SSE 推播給前端
```

**磁碟儲存結構（以處室 ID=1 為例）：**
```
uploads/1/
├── original/          原始上傳檔案
└── processed/
    ├── markdown/      轉換後的 .md
    ├── summaries/     summary.json（含 original_content）
    └── embeddings/    embedding.json（含 embedding 向量）
```

RAG 查詢時，VectorStore 直接從 `embeddings/` 載入所有 `*_embedding.json` 並 in-memory 快取，避免每次查詢都重新讀磁碟。

#### 批次最終狀態邏輯

| 狀態 | 條件 |
|------|------|
| `COMPLETED` | 全部成功 |
| `PARTIAL` | 混合成功與失敗/取消 |
| `FAILED` | 全部失敗（無取消） |
| `CANCELED` | 全部取消 |

---

### 3.3 分類管理

管理知識庫文件的分類標籤。使用者上傳時可指定分類，查詢前台可依分類篩選 RAG 搜尋範圍。

**操作：** 新增（名稱 + 顏色）、編輯、刪除（需先將文件移出該分類）

---

### 3.4 身分組管理（重要功能）

控制哪些查詢使用者可以存取哪些文件，是本系統的權限核心。

**觀念說明：**
- **身分組**（UserGroup）類似「角色」，例如「人事主管」、「正式員工」
- 每個查詢使用者可屬於多個身分組
- 每份文件可授權給多個身分組存取

**文件存取規則（依優先序）：**
1. `is_public = true`：所有使用者皆可存取（不受身分組限制）
2. 文件授權給使用者所屬的身分組：可存取
3. 以上皆否：無法在 RAG 搜尋中取得此文件

**流程圖：**
```
管理員建立身分組（例如：全體員工）
  ↓
將查詢使用者加入身分組
  ↓  
上傳文件時指定此文件授權給哪些身分組
  ↓
或在知識庫管理頁面事後設定文件的身分組權限
  ↓
使用者登入查詢前台發問時，後端自動過濾其有權存取的文件
```

**批次設定權限：** 在知識庫管理頁面選取多個檔案後，可一次設定身分組授權。

---

### 3.5 查詢使用者管理

管理前台（查詢系統）的終端使用者帳號。

**功能：**
- 建立使用者（管理員直接建立，繞過審核流程）
- 編輯帳號資訊（名稱、email、所屬處室、身分組）
- 暫停 / 啟用帳號
- 刪除帳號

---

### 3.6 FAQ 管理

設定顯示在查詢前台聊天頁側欄的常見問題，點擊直接送出。支援啟用/停用與拖曳排序。

---

## 4. No-Result 分析

**路徑：** Super Admin / 全球總覽 → 無結果問題分析

分析過去一段時間內，使用者提問但 RAG 未找到相關文件的問題，利用 embedding 語意聚類，整理出最常出現的無結果問題類型，協助管理員判斷缺少哪些知識庫文件。

**呼叫：** `POST /api/statistics/no-results-insights/run`
