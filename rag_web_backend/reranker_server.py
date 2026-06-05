"""
獨立的 Reranker API Server
在有 GPU 的機器上執行，提供 rerank 推論服務

啟動方式:
    uvicorn reranker_server:app --host 0.0.0.0 --port 8100
    # 或指定 workers（每個 worker 各載入一份模型，注意 GPU 記憶體）
    uvicorn reranker_server:app --host 0.0.0.0 --port 8100 --workers 1
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import CrossEncoder

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 全域模型與推論鎖
model: CrossEncoder = None
inference_lock: asyncio.Lock = None


class RerankRequest(BaseModel):
    query: str
    candidates: List[dict]  # 每個元素需有 "summary" 欄位
    threshold: Optional[float] = None


class RerankResult(BaseModel):
    document: dict
    similarity: float
    summary: str
    score: float


class RerankResponse(BaseModel):
    results: List[RerankResult]
    total_input: int
    total_output: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, inference_lock
    inference_lock = asyncio.Lock()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_name = "BAAI/bge-reranker-v2-m3"
    logger.info(f"[RerankerServer] loading model: {model_name} (device: {device})")
    model = CrossEncoder(model_name, device=device)
    logger.info(f"[RerankerServer] model loaded on {device}")

    yield

    del model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


app = FastAPI(title="Reranker Service", lifespan=lifespan)


@app.post("/rerank", response_model=RerankResponse)
async def rerank(request: RerankRequest):
    """
    對候選文件進行 rerank。
    使用 asyncio.Lock 確保 GPU 推論不會同時執行多個（避免 OOM），
    但多個請求可以同時被接受並排隊等待。
    """
    pairs = [[request.query, c["summary"]] for c in request.candidates]

    # 排隊等待 GPU 推論
    async with inference_lock:
        loop = asyncio.get_event_loop()
        scores = await loop.run_in_executor(None, _predict, pairs)

    # 組裝結果
    results = []
    for c, s in zip(request.candidates, scores):
        score = float(s)
        if request.threshold is not None and score < request.threshold:
            continue
        results.append(RerankResult(
            document=c["document"],
            similarity=c["similarity"],
            summary=c["summary"],
            score=score,
        ))

    results.sort(key=lambda x: x.score, reverse=True)

    return RerankResponse(
        results=results,
        total_input=len(request.candidates),
        total_output=len(results),
    )


def _predict(pairs: List[List[str]]) -> list:
    """同步推論（在 executor 中執行）"""
    with torch.no_grad():
        scores = model.predict(pairs)
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return scores.tolist() if hasattr(scores, 'tolist') else list(scores)


@app.get("/health")
async def health():
    return {"status": "ok", "device": "cuda" if torch.cuda.is_available() else "cpu"}
