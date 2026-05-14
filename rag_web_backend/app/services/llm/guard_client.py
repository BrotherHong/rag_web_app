"""llama-guard3:8b 安全過濾服務"""

import json
import logging
import urllib.request
import urllib.error
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class GuardResult:
    is_safe: bool
    categories: list[str]  # 違規類別，例如 ["S9", "S2"]


def check_query_safety(user_message: str) -> GuardResult:
    """
    呼叫 llama-guard3:8b 檢查查詢是否安全。
    若 Ollama 服務不可用，預設放行（fail-open）避免影響正常服務。
    """
    base_url = settings.OLLAMA_BASE_URL
    if not base_url:
        return GuardResult(is_safe=True, categories=[])

    payload = json.dumps({
        "model": settings.GUARD_MODEL,
        "messages": [{"role": "user", "content": user_message}],
        "stream": False,
        "options": {"temperature": 0, "num_predict": 20},
    }).encode()

    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            raw = data.get("message", {}).get("content", "").strip().lower()
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
