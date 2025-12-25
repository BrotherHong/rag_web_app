from sentence_transformers import CrossEncoder
from typing import List
import logging

logger = logging.getLogger(__name__)


class Reranker:
    """
    一個簡單的 Reranker 包裝類別
    使用 BAAI/bge-reranker-v2-m3 來對 (query, candidate['summary']) 做排序
    """

    def __init__(self, model_name: str = "BAAI/bge-reranker-v2-m3"):
        # 載入 CrossEncoder 模型
        logger.info(f"[Reranker] loading model: {model_name}")
        self.model = CrossEncoder(model_name)

    def rerank(self, query: str, candidates: List[dict], threshold: float = None) -> List[dict]:
        """
        對候選文件進行 rerank，回傳包含原始資訊 + 分數的 list，並依分數排序

        Args:
            query (str): 查詢字串 (Query)
            candidates (List[Dict[str, str]]): 候選文件，每個元素包含:
                - document (dict): 原始文件資訊
                - similarity (float): 原始相似度分數
                - summary (str): 文件摘要
            threshold (float): Rerank 分數閾值，低於此值的文檔會被過濾

        Returns:
            (List[dict]): 排序後的清單，每個元素包含:
                - document (dict): 原始文件資訊
                - similarity (float): 原始相似度分數
                - summary (str): 文件摘要
                - score (float): reranker 分數 (越高越相關)
        """
        # 準備 (query, summary) 配對
        pairs = [[query, c["summary"]] for c in candidates]

        # 模型預測分數 (相關性分數，float，越高越相關)
        scores = self.model.predict(pairs)

        # 將分數加回 candidates
        results = []
        for c, s in zip(candidates, scores):
            score = float(s)
            # 如果設定了 threshold，過濾掉低分文檔
            if threshold is not None and score < threshold:
                continue
            
            item = {
                "document": c["document"],
                "similarity": c["similarity"],
                "summary": c["summary"],
                "score": score
            }
            results.append(item)

        # 依照分數由高到低排序
        results.sort(key=lambda x: x["score"], reverse=True)
        
        if threshold is not None:
            logger.info(f"Rerank 過濾: {len(candidates)} → {len(results)} 個文檔 (閾值: {threshold})")

        return results
