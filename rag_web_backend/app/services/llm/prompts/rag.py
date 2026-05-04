"""
RAG-specific Prompt Templates
"""

# Document classification prompt
DOCUMENT_CLASSIFICATION = """請分析以下文檔內容，判斷文檔類型：

如果文檔主要是「要資料填寫」或「申請用文件」（如申請書、申請表、通知單、報告書、簽辦表），請回答「Form Mode」。
如果文檔包含「知識性內容」或「資訊性內容」（如教學、流程說明、操作指引、通訊錄、組織架構），請回答「Info Mode」。

請只回答「Form Mode」或「Info Mode」，不要其他說明。

文檔內容：
{text}"""

# Simple summary for form documents
FORM_DOCUMENT_SUMMARY = """這是一個表單類文檔，請簡潔摘要其用途和基本資訊：

文檔名稱：{filename}

摘要要求：
1. 說明文檔的主要用途
2. 指出適用對象或部門
3. 列出需要填寫的主要欄位或資訊（如有）
4. 保持簡潔，重點突出可搜尋的關鍵詞
5. 控制在 200 字以內

文檔內容：
{text}"""

# RAG answer generation with concise CoT and citations
RAG_ANSWER_PROMPT = """你是專業的文檔查詢助手，請僅根據提供的文檔回答問題。

<回答規則>
1. 若文檔有足夠資訊：直接條列式回答，不加開場白；若無：回覆「目前資料庫中沒有找到相關資訊」並說明文檔主要涉及什麼。不推測或編造。
2. 每點結尾加上（文檔X）標明來源。
</回答規則>

<回答格式>
- 內容……（文檔X）
- 內容……（文檔X）
</回答格式>

使用者提問：{query}

文檔：
{context}

嚴格根據回答規則和格式進行回答：
"""

# RAG document summary - optimized for semantic retrieval

# English version (not used):
RAG_DOCUMENT_SUMMARY = """You are a professional document summarizer. Based on the document content below,
generate a summary optimized for semantic retrieval (cosine similarity).

Document Title: {filename}
Document Content: {text}

Requirements:
1. Preserve the document's main content and core concepts (topics, processes, rules, definitions, conditions).
2. Retain all names, locations, organizations, and proper nouns without omission.
3. Generate 3-5 retrievable keywords.
4. Generate at least 3 questions users might ask, using varied phrasings to improve semantic diversity.
5. The summary should be long enough to cover the entire chunk, but does not need to be a verbatim translation.

## Output Format (YAML):

```yaml
title: <document title if determinable from content, otherwise leave blank>
doc_type: <document type, e.g. Tutorial/Process/Regulation>
summary: |
  <complete summary covering the document's main content>
keywords:
  - <keyword1>
  - <keyword2>
  - <keyword3>
query_variants:
  - "<possible user question 1>"
  - "<possible user question 2>"
  - "<possible user question 3>"
```
Note: All output values must be written in Traditional Chinese."""

# RAG_DOCUMENT_SUMMARY = """你是一個專業的文檔摘要生成器。請根據以下文檔內容，生成適合用於語義檢索（cosine 相似度）的摘要。

# 文檔標題：{filename}
# 文檔內容：{text}

# 要求：
# 1. 保留文件的主要內容與核心概念（主題、流程、規範、規則、定義、條件）。
# 2. 特別保留人名、地點、單位、專有名詞，避免遺漏。
# 3. 產生可供檢索的關鍵詞（3-5個）。
# 4. 產生使用者可能會提出的常見問題（至少 3 個），用不同問法來增加語意多樣性。
# 5. 摘要要足夠長，能涵蓋整個 chunk 的資訊，但不需要逐字翻譯。

# ## 輸出格式（請用 YAML 格式輸出）

# ```yaml
# title: <文件標題，如可從內容判斷則填寫，否則留空>
# doc_type: <文件類型，如 教學/流程/規範>
# summary: |
#   <完整摘要，涵蓋文檔主要內容>
# keywords:
#   - <關鍵詞1>
#   - <關鍵詞2>
#   - <關鍵詞3>
# query_variants:
#   - "<使用者可能會問的問題1>"
#   - "<使用者可能會問的問題2>"
#   - "<使用者可能會問的問題3>"
# ```"""

# RAG query response prompt with Chain of Thought
RAG_QUERY_PROMPT = """你是一個智能文檔助理，專門幫助用戶從文檔庫中找到和分析信息。

基於以下檢索到的相關文檔內容，請回答用戶的問題。

用戶問題：{query}

相關文檔內容：
{context}

請按照以下步驟思考並回答：

<思考過程>
1. 分析問題的核心需求
2. 檢視文檔內容中的相關資訊
3. 判斷是否有足夠資訊回答問題
4. 組織答案的邏輯結構
</思考過程>

<回答>
請直接、清晰地回答用戶的問題，不需要說「根據某某文檔」之類的開場白。

回答要求：
1. 直接針對問題給出答案
2. 答案要準確、完整、易懂
3. 使用條列式或分段方式呈現（如果適合）
4. 如果文檔中沒有足夠資訊，請明確說明「目前資料庫中沒有相關資訊」
5. 不要編造或推測文檔中沒有的內容
</回答>

請開始你的回答："""

# No results found prompt
RAG_NO_RESULTS_PROMPT = """抱歉，資料庫中沒有找到與您的問題相關的文檔。

建議您可以：
- 使用不同的關鍵詞重新提問
- 嘗試更具體或更寬泛的問法"""
