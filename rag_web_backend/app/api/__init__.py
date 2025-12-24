"""API 路由總入口"""

from fastapi import APIRouter
from app.api import auth, users, departments, files, categories, rag, activities, settings, statistics, backups, upload, public, faqs

# 建立 API 路由器
api_router = APIRouter()

# 健康檢查端點
@api_router.get("/health", tags=["系統"])
async def health_check():
    """API 健康檢查"""
    return {
        "status": "healthy",
        "message": "API is running"
    }

# 註冊各模組路由
api_router.include_router(public.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(departments.router)
api_router.include_router(files.router)
api_router.include_router(categories.router)
api_router.include_router(rag.router)
api_router.include_router(activities.router)
api_router.include_router(settings.router)
api_router.include_router(statistics.router)
api_router.include_router(backups.router)
api_router.include_router(upload.router)
api_router.include_router(faqs.router)

__all__ = ["api_router"]
