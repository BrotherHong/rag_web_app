import httpx
from typing import List
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class Reranker:
    """
    Reranker HTTP Client
    呼叫獨立的 Reranker Server API 進行文件重新排序
    """

    def __init__(self):
        self.api_url = settings.RERANKER_API_URL.rstrip("/")
        logger.info(f"[Reranker] using API mode: {self.api_url}")

    async def rerank(self, query: str, candidates: List[dict], threshold: float = None) -> List[dict]:
        """
        呼叫 Reranker Server 對候選文件進行 rerank

        Args:
            query: 查詢字串
            candidates: 候選文件列表，每個元素包含 document, similarity, summary
            threshold: Rerank 分數閾值，低於此值的文檔會被過濾

        Returns:
            排序後的文件列表，包含 document, similarity, summary, score
        """
        payload = {
            "query": query,
            "candidates": candidates,
            "threshold": threshold,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{self.api_url}/rerank", json=payload)
            response.raise_for_status()

        data = response.json()
        results = data["results"]

        if threshold is not None:
            logger.info(
                f"Rerank 過濾: {data['total_input']} → {data['total_output']} 個文檔 (閾值: {threshold})"
            )

        return results
