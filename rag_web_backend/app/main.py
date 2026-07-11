"""FastAPI 應用程式主入口"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.core.database import init_db, close_db
from app.core.logging_config import setup_logging
from app.core.limiter import limiter
from app.services.llm.exceptions import LLMServiceError
from app.api import api_router  # 導入 API 路由

logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    # 初始化日誌系統（清空舊日誌、配置格式）
    logger = setup_logging()
    
    # 啟動時初始化資料庫連線
    await init_db()
    logger.info("✅ 資料庫連線已初始化")

    yield
    
    # 關閉時清理資料庫連線
    logger = logging.getLogger("app")
    await close_db()
    logger.info("✅ 資料庫連線已關閉")

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="RAG 知識庫管理系統後端 API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
    root_path=""
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(LLMServiceError)
async def llm_service_error_handler(request: Request, exc: LLMServiceError):
    """LLM 推論服務失敗時統一回應，原始錯誤僅記於後端 log。"""
    logger.error(f"LLM 服務失敗: {exc}")
    return JSONResponse(
        status_code=503,
        content={"detail": "問答服務暫時無法使用，請稍後再試。"},
    )

# 設定 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 註冊 API 路由
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/")
async def root():
    """根端點"""
    return {
        "message": "RAG Knowledge Base API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get(f"{settings.API_V1_PREFIX}/")
async def api_root():
    """API 根端點"""
    return {
        "message": "RAG Knowledge Base API v1",
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get(f"{settings.API_V1_PREFIX}/health")
async def health_check():
    """健康檢查端點（用於 Docker 容器健康監控）"""
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "debug_mode": settings.DEBUG,
        "version": "1.0.0"
    }


if __name__ == "__main__":
    import uvicorn
    from app.core.logging_config import LOGGING_CONFIG
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_config=LOGGING_CONFIG
    )
