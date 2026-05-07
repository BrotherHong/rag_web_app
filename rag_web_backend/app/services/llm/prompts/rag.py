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

# RAG answer generation - system prompt base
RAG_SYSTEM_BASE = """你是{assistant_name}。根據提供的文檔回答問題，不推測或編造。
{style_instruction}
<規則>
- 直接回答，不加開場白
- 輸出純文字，不使用 Markdown
- 資訊不足時回覆「目前資料庫中沒有找到相關資訊」
- 文檔附有來源連結時，若與問題相關，在回答中提供
{citation_instruction}</規則>"""

# RAG answer generation - user prompt template
RAG_USER_TEMPLATE = """{context}

問題：{query}"""

# Citation instruction variants
CITATION_ENABLED = "- 在段落末尾標注來源（文檔X），不必每句都加\n"
CITATION_DISABLED = ""

DEFAULT_ASSISTANT_NAME = "文檔查詢助手"
DEFAULT_STYLE = "親切、活潑、口語化，語氣輕鬆有溫度，用自然段落回答，像在跟同事聊天解釋，避免過多條列"


def build_rag_system_prompt(
    assistant_name: str | None = None,
    assistant_style: str | None = None,
    include_citations: bool = True,
) -> str:
    """組合 RAG system prompt"""
    name = assistant_name or DEFAULT_ASSISTANT_NAME
    style = f"\n{assistant_style or DEFAULT_STYLE}\n"
    citation = CITATION_ENABLED if include_citations else CITATION_DISABLED
    return RAG_SYSTEM_BASE.format(
        assistant_name=name,
        style_instruction=style,
        citation_instruction=citation,
    )

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

# No results found prompt
RAG_NO_RESULTS_PROMPT = """抱歉，資料庫中沒有找到與您的問題相關的文檔。

建議您可以：
- 使用不同的關鍵詞重新提問
- 嘗試更具體或更寬泛的問法"""
