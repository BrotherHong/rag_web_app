"""Utilities for detecting no-result RAG answers."""

from typing import Optional


NO_RESULT_MARKERS = (
    "目前資料庫中沒有找到相關資訊",
    "資料庫中沒有找到與您的問題相關的文檔",
)


def is_no_result_answer(answer: Optional[str]) -> bool:
    """Return True when answer indicates RAG has no relevant information."""
    if not answer:
        return False

    text = answer.strip()
    if not text:
        return False

    return any(marker in text for marker in NO_RESULT_MARKERS)
