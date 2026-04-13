"""公開 API 路由（無需認證）"""

import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any, Optional

from app.core.database import get_db
from app.core.security import get_current_query_user
from app.models.faq import FAQ
from app.models.query_user import QueryUser

router = APIRouter(prefix="", tags=["公開 API"])


@router.get("/faq/list")
async def get_faq_list(
    department_id: int = Query(..., description="處室 ID（必須）"),
    limit: Optional[int] = Query(None, description="限制返回的問題數量"),
    category: Optional[str] = Query(None, description="按分類過濾問題"),
    current_user: QueryUser = Depends(get_current_query_user),
    db: AsyncSession = Depends(get_db)
):
    """
    獲取常見問題列表（需登入）
    
    參數:
        - department_id: 處室 ID（必須）
        - limit: 限制返回的問題數量，不傳則返回全部
        - category: 按分類過濾問題（可選）
    
    返回常見問題列表，適用於：
    - 首頁展示：傳入 limit=4 獲取前幾個問題
    - 聊天頁快速問題：不傳 limit 獲取完整列表
    """
    try:
        # 構建查詢 - 只返回指定處室的啟用 FAQ
        query = select(FAQ).where(
            FAQ.is_active == True,
            FAQ.department_id == department_id
        )
        
        # 如果有分類過濾
        if category:
            query = query.where(FAQ.category == category)
        
        # 按 order 排序
        query = query.order_by(FAQ.order.asc(), FAQ.id.asc())
        
        # 執行查詢
        result = await db.execute(query)
        faqs = result.scalars().all()
        
        # 轉換為字典列表
        faq_list = [
            {
                "id": faq.id,
                "category": faq.category,
                "question": faq.question,
                "description": faq.description,
                "answer": faq.answer,
                "icon": faq.icon,
                "order": faq.order
            }
            for faq in faqs
        ]
        
        # 如果有限制數量
        if limit is not None and limit > 0:
            faq_list = faq_list[:limit]
        
        return {
            "success": True,
            "data": faq_list,
            "total": len(faq_list)
        }
    except Exception as e:
        # 如果資料庫查詢失敗，返回空列表而不是錯誤
        print(f"Error fetching FAQs: {e}")
        return {
            "success": True,
            "data": [],
            "total": 0
        }


@router.get("/public/files/{file_id}/download")
async def download_file_public(
    file_id: int,
    db: AsyncSession = Depends(get_db)
):
    """公開下載端點（無需認證）— 供 RAG 查詢結果的來源文件下載使用"""
    from app.models.file import File as FileModel

    file = await db.get(FileModel, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="檔案不存在")

    file_path = f"uploads/{file.department_id}/processed/data/{file.filename}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="檔案實體不存在")

    return FileResponse(
        path=file_path,
        filename=file.original_filename,
        media_type=file.mime_type or "application/octet-stream"
    )


@router.get("/public/welcome")
async def get_welcome_message(current_user: QueryUser = Depends(get_current_query_user)):
    """
    獲取歡迎訊息（需登入）
    """
    return {
        "success": True,
        "data": {
            "title": "歡迎使用 RAG 知識庫查詢系統",
            "message": "您好！我是 AI 助手 👋\n\n我可以協助您查詢相關文檔和資訊。請問有什麼我可以幫助您的嗎？",
            "tips": [
                "盡量使用完整的問句",
                "可以參考右側的常見問題",
                "點擊快速問題快速開始"
            ]
        }
    }
