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
        self.api_url = settings.RERANKER_API_URL.strip().rstrip("/")
        self.rerank_url = self.api_url if self.api_url.endswith("/rerank") else f"{self.api_url}/rerank"
        self.model = settings.RERANKER_MODEL
        self.api_format = settings.RERANKER_API_FORMAT.strip().lower()
        if self.api_format not in {"internal", "tei"}:
            raise ValueError("RERANKER_API_FORMAT must be 'internal' or 'tei'")
        logger.info(f"[Reranker] using API endpoint: {self.rerank_url} ({self.api_format})")

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
        async with httpx.AsyncClient(timeout=30.0) as client:
            if self.api_format == "tei":
                payload = {
                    "model": self.model,
                    "query": query,
                    "texts": [candidate.get("summary", "") for candidate in candidates],
                }
                response = await client.post(
                    self.rerank_url,
                    json=payload,
                )
                response.raise_for_status()
                results = self._parse_tei_response(response.json(), candidates, threshold)
            else:
                payload = {
                    "query": query,
                    "candidates": candidates,
                    "threshold": threshold,
                }
                response = await client.post(
                    self.rerank_url,
                    json=payload,
                )
                response.raise_for_status()
                results = response.json()["results"]

        if threshold is not None:
            logger.info(
                f"Rerank 過濾: {len(candidates)} → {len(results)} 個文檔 (閾值: {threshold})"
            )

        return results

    def _parse_tei_response(self, data, candidates: List[dict], threshold: float = None) -> List[dict]:
        if isinstance(data, dict):
            tei_results = data.get("results") or data.get("data") or []
        else:
            tei_results = data
        results = []

        for item in tei_results:
            if not isinstance(item, dict):
                continue

            index = item.get("index")
            if index is None:
                continue

            index = int(index)
            if index < 0 or index >= len(candidates):
                continue

            score_value = item.get("score", item.get("relevance_score"))
            if score_value is None:
                continue

            score = float(score_value)
            if threshold is not None and score < threshold:
                continue

            candidate = candidates[index]
            results.append({
                "document": candidate["document"],
                "similarity": candidate["similarity"],
                "summary": candidate["summary"],
                "score": score,
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results
