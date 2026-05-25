"""No-result query insight analyzer."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.query_history import QueryHistory
from app.services.llm.litellm_client import LiteLLMClient
from app.services.rag.no_result_utils import is_no_result_answer

logger = logging.getLogger(__name__)


class NoResultQuestionAnalyzer:
    """Build top no-result question insights from query history."""

    def __init__(self, embedding_client: LiteLLMClient | None = None):
        self.embedding_client = embedding_client

    async def analyze(
        self,
        db: AsyncSession,
        department_id: int,
        days: int = 30,
        top_n: int = 10,
        similarity_threshold: float = 0.84,
        min_cluster_count: int = 1,
        max_unique_questions: int = 500,
        use_llm_refine: bool = False,
    ) -> dict[str, Any]:
        since = datetime.utcnow() - timedelta(days=days)

        query_stmt = (
            select(
                QueryHistory.query,
                QueryHistory.answer,
                QueryHistory.extra_data,
                QueryHistory.created_at,
            )
            .where(
                QueryHistory.department_id == department_id,
                QueryHistory.created_at >= since,
            )
            .order_by(QueryHistory.created_at.desc())
        )
        rows = (await db.execute(query_stmt)).all()

        aggregated = self._aggregate_no_result_questions(rows)
        total_no_result_queries = sum(item["count"] for item in aggregated.values())
        if not aggregated:
            return {
                "period": {
                    "days": days,
                    "start_at": since.isoformat(),
                    "end_at": datetime.utcnow().isoformat(),
                },
                "meta": {
                    "total_no_result_queries": 0,
                    "unique_no_result_questions": 0,
                    "method": "no_result_filter_only",
                },
                "items": [],
            }

        unique_items = sorted(
            aggregated.values(),
            key=lambda item: (item["count"], item["last_asked_at"]),
            reverse=True,
        )[:max_unique_questions]

        embeddings = await self._embed_questions([item["display_query"] for item in unique_items])

        clustered = self._cluster_questions(unique_items, embeddings, similarity_threshold)
        clustered = [item for item in clustered if item["count"] >= min_cluster_count]
        clustered.sort(key=lambda item: (item["count"], item["last_asked_at"]), reverse=True)
        top_items = clustered[:top_n]

        if use_llm_refine and top_items:
            await self._refine_labels(top_items)

        return {
            "period": {
                "days": days,
                "start_at": since.isoformat(),
                "end_at": datetime.utcnow().isoformat(),
            },
            "meta": {
                "total_no_result_queries": total_no_result_queries,
                "unique_no_result_questions": len(aggregated),
                "clustered_candidates": len(clustered),
                "method": "embedding_semantic_clustering",
                "similarity_threshold": similarity_threshold,
                "llm_refined": use_llm_refine,
            },
            "items": top_items,
        }

    def _aggregate_no_result_questions(self, rows: list[tuple[Any, ...]]) -> dict[str, dict[str, Any]]:
        aggregated: dict[str, dict[str, Any]] = {}

        for query, answer, extra_data, created_at in rows:
            query_text = (query or "").strip()
            if not query_text:
                continue

            is_no_result = self._is_no_result_record(answer=answer, extra_data=extra_data)
            if not is_no_result:
                continue

            normalized = " ".join(query_text.split())
            if normalized not in aggregated:
                aggregated[normalized] = {
                    "normalized_query": normalized,
                    "display_query": query_text,
                    "count": 1,
                    "first_asked_at": created_at,
                    "last_asked_at": created_at,
                }
            else:
                item = aggregated[normalized]
                item["count"] += 1
                if created_at > item["last_asked_at"]:
                    item["last_asked_at"] = created_at
                    item["display_query"] = query_text
                if created_at < item["first_asked_at"]:
                    item["first_asked_at"] = created_at

        return aggregated

    @staticmethod
    def _is_no_result_record(answer: str | None, extra_data: Any) -> bool:
        if isinstance(extra_data, dict):
            value = extra_data.get("is_no_result")
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                lowered = value.strip().lower()
                if lowered in {"true", "1", "yes"}:
                    return True
                if lowered in {"false", "0", "no"}:
                    return False

        return is_no_result_answer(answer)

    async def _embed_questions(self, questions: list[str]) -> list[np.ndarray | None]:
        if not questions:
            return []

        try:
            client = self.embedding_client or LiteLLMClient()
            self.embedding_client = client
        except Exception as exc:
            logger.error("Embedding client initialization failed: %s", exc)
            return [None] * len(questions)

        semaphore = asyncio.Semaphore(6)

        async def _embed(text: str) -> np.ndarray | None:
            async with semaphore:
                try:
                    vec = await client.generate_embedding(text)
                    if not vec:
                        return None
                    arr = np.array(vec, dtype=float)
                    norm = np.linalg.norm(arr)
                    if norm == 0:
                        return None
                    return arr / norm
                except Exception as exc:
                    logger.warning("Embedding failed for query '%s': %s", text[:50], exc)
                    return None

        return await asyncio.gather(*[_embed(question) for question in questions])

    def _cluster_questions(
        self,
        unique_items: list[dict[str, Any]],
        embeddings: list[np.ndarray | None],
        similarity_threshold: float,
    ) -> list[dict[str, Any]]:
        clusters: list[dict[str, Any]] = []

        for item, vector in zip(unique_items, embeddings):
            if vector is None:
                clusters.append(self._create_single_cluster(item))
                continue

            best_idx = -1
            best_score = -1.0
            for idx, cluster in enumerate(clusters):
                centroid = cluster.get("centroid")
                if centroid is None:
                    continue
                score = float(np.dot(vector, centroid))
                if score > best_score:
                    best_score = score
                    best_idx = idx

            if best_idx >= 0 and best_score >= similarity_threshold:
                self._append_to_cluster(clusters[best_idx], item, vector)
            else:
                clusters.append(self._create_single_cluster(item, vector))

        return [self._finalize_cluster(cluster) for cluster in clusters]

    @staticmethod
    def _create_single_cluster(item: dict[str, Any], vector: np.ndarray | None = None) -> dict[str, Any]:
        weight = item["count"]
        sum_vec = (vector * weight) if vector is not None else None
        centroid = vector if vector is not None else None
        return {
            "members": [item],
            "sum_vec": sum_vec,
            "centroid": centroid,
            "weight": weight,
        }

    @staticmethod
    def _append_to_cluster(cluster: dict[str, Any], item: dict[str, Any], vector: np.ndarray) -> None:
        cluster["members"].append(item)
        cluster["weight"] += item["count"]

        if cluster["sum_vec"] is None:
            cluster["sum_vec"] = vector * item["count"]
        else:
            cluster["sum_vec"] = cluster["sum_vec"] + (vector * item["count"])

        norm = np.linalg.norm(cluster["sum_vec"])
        cluster["centroid"] = (cluster["sum_vec"] / norm) if norm > 0 else None

    @staticmethod
    def _finalize_cluster(cluster: dict[str, Any]) -> dict[str, Any]:
        members = sorted(
            cluster["members"],
            key=lambda item: (item["count"], item["last_asked_at"]),
            reverse=True,
        )
        representative = members[0]

        count = sum(item["count"] for item in members)
        first_asked_at = min(item["first_asked_at"] for item in members)
        last_asked_at = max(item["last_asked_at"] for item in members)

        return {
            "question": representative["display_query"],
            "count": count,
            "member_count": len(members),
            "sample_questions": [item["display_query"] for item in members[:5]],
            "first_asked_at": first_asked_at.isoformat(),
            "last_asked_at": last_asked_at.isoformat(),
        }

    async def _refine_labels(self, items: list[dict[str, Any]]) -> None:
        try:
            client = self.embedding_client or LiteLLMClient()
            self.embedding_client = client
        except Exception as exc:
            logger.warning("Skip label refinement: %s", exc)
            return

        for item in items:
            if item.get("member_count", 1) <= 1:
                continue

            samples = item.get("sample_questions") or []
            prompt = (
                "你是查詢問題聚類助手。以下是語意相近問題清單，"
                "請輸出一個最具代表性的繁體中文問題句，僅輸出一句，不要解釋。\n\n"
                + "\n".join([f"- {text}" for text in samples[:5]])
            )
            try:
                refined = (await client.generate(prompt)).strip()
                refined = refined.strip('"').strip()
                if refined:
                    item["question"] = refined
            except Exception as exc:
                logger.warning("Label refinement failed: %s", exc)
