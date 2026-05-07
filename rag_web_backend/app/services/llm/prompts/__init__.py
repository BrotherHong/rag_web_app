"""Prompt 模板"""

from .rag import (
    DOCUMENT_CLASSIFICATION,
    FORM_DOCUMENT_SUMMARY,
    RAG_DOCUMENT_SUMMARY,
    RAG_SYSTEM_BASE,
    RAG_USER_TEMPLATE,
    build_rag_system_prompt,
    RAG_NO_RESULTS_PROMPT
)
from .summary import SIMPLE_SUMMARY

__all__ = [
    "DOCUMENT_CLASSIFICATION",
    "FORM_DOCUMENT_SUMMARY",
    "RAG_DOCUMENT_SUMMARY",
    "RAG_SYSTEM_BASE",
    "RAG_USER_TEMPLATE",
    "build_rag_system_prompt",
    "RAG_NO_RESULTS_PROMPT",
    "SIMPLE_SUMMARY"
]
