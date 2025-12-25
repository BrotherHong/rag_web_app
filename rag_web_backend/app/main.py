"""FastAPI 應用程式主入口"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.core.database import init_db, close_db
from app.api import api_router  # 導入 API 路由

# 獲取應用日誌記錄器
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    # 啟動時初始化資料庫連線
    await init_db()
    logger.info("✅ 資料庫連線已初始化")
    
    yield
    
    # 關閉時清理資料庫連線
    await close_db()
    logger.info("✅ 資料庫連線已關閉")

# 建立 FastAPI 應用程式
app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="RAG 知識庫管理系統後端 API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,  # 添加生命週期管理
    root_path=""
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
