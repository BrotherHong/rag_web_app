"""LLM 服務相關例外"""


class LLMServiceError(Exception):
    """LLM 推論服務（文字生成 / 嵌入）呼叫失敗，通常代表端點皆不可用。"""
