"""FastAPI 應用程式主入口"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.core.database import init_db, close_db
from app.core.logging_config import setup_logging
from app.api import api_router  # 導入 API 路由


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    # 初始化日誌系統（清空舊日誌、配置格式）
    logger = setup_logging()
    
    # 啟動時初始化資料庫連線
    await init_db()
    logger.info("✅ 資料庫連線已初始化")

    # 背景預熱 RAG Engine，不阻塞 server 啟動
    import asyncio

    async def _warmup():
        await asyncio.sleep(2)  # 等 server 完全啟動後再預熱
        try:
            from app.core.database import AsyncSessionLocal
            from sqlalchemy import select, distinct
            from app.models.file import File as FileModel
            from app.api.rag import get_dept_rag_engine
            import concurrent.futures

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(distinct(FileModel.department_id)).where(FileModel.is_vectorized == True)
                )
                dept_ids = [row[0] for row in result.all() if row[0] is not None]

            loop = asyncio.get_event_loop()
            for dept_id in dept_ids:
                try:
                    await loop.run_in_executor(None, get_dept_rag_engine, dept_id)
                    logger.info(f"✅ RAG Engine 預熱完成 (dept {dept_id})")
                except Exception as e:
                    logger.warning(f"⚠️ RAG Engine 預熱失敗 (dept {dept_id}): {e}")
        except Exception as e:
            logger.warning(f"⚠️ RAG Engine 預熱流程錯誤: {e}")

    asyncio.create_task(_warmup())

    yield
    
    # 關閉時清理資料庫連線
    logger = logging.getLogger("app")
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
