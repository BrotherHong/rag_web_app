"""llama-guard3:8b 安全過濾服務"""

import logging
from dataclasses import dataclass

from app.config import settings
from app.services.llm.litellm_client import get_llm_client

logger = logging.getLogger(__name__)


@dataclass
class GuardResult:
    is_safe: bool
    categories: list[str]  # 違規類別，例如 ["S9", "S2"]


async def check_query_safety(user_message: str) -> GuardResult:
    """
    呼叫 llama-guard3:8b 檢查查詢是否安全。
    透過共用 LiteLLM Router（多端點 + 冷卻）呼叫；服務不可用時預設放行（fail-open）。
    """
    if not settings.ollama_base_urls:
        return GuardResult(is_safe=True, categories=[])

    try:
        raw = (await get_llm_client().check_guard(user_message)).strip().lower()
    except Exception as e:
        logger.warning(f"⚠️ Guard check failed (fail-open): {e}")
        return GuardResult(is_safe=True, categories=[])

    lines = raw.splitlines()
    first_line = lines[0].strip() if lines else ""

    if "unsafe" in first_line:
        categories = []
        if len(lines) > 1:
            categories = [c.strip().upper() for c in lines[1].split(",") if c.strip()]
        logger.warning(f"🚫 Guard blocked query | categories={categories} | query={user_message[:80]}")
        return GuardResult(is_safe=False, categories=categories)

    return GuardResult(is_safe=True, categories=[])
