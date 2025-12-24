"""公開 API 路由（無需認證）"""

import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any, Optional

from app.core.database import get_db
from app.models.faq import FAQ

router = APIRouter(prefix="", tags=["公開 API"])


@router.get("/faq/list")
async def get_faq_list(
    department_id: int = Query(..., description="處室 ID（必須）"),
    limit: Optional[int] = Query(None, description="限制返回的問題數量"),
    category: Optional[str] = Query(None, description="按分類過濾問題"),
    db: AsyncSession = Depends(get_db)
):
    """
    獲取常見問題列表（公開端點）
    
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


@router.get("/public/info")
async def get_public_system_info():
    """
    獲取公開系統資訊（無需認證）
    
    返回系統基本資訊和歡迎訊息
    """
    return {
        "success": True,
        "data": {
            "app_name": "RAG 知識庫查詢系統",
            "version": "1.0.0",
            "description": "基於 RAG 技術的智能問答系統",
            "welcome_message": "歡迎使用 RAG 知識庫查詢系統！您可以在這裡查詢相關文檔和資訊。",
            "features": [
                "智能文檔搜尋",
                "自然語言問答",
                "多處室資料管理",
                "查詢歷史記錄"
            ],
            "support_email": "support@ncku.edu.tw",
            "support_phone": "(06) 275-7575"
        }
    }


@router.get("/public/files/{file_id}/download")
async def download_file_public(
    file_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    公開下載端點（無需認證）
    
    用於 RAG 查詢結果的檔案下載
    """
    from app.models.file import File as FileModel
    
    # 取得檔案記錄
    file = await db.get(FileModel, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="檔案不存在")
    
    # 構建 processed/data 路徑
    file_path = f"uploads/{file.department_id}/processed/data/{file.filename}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="檔案實體不存在")
    
    # 返回檔案（使用原始檔名）
    # 注意：公開下載不記錄活動，因為 activities 表的 user_id 是必填
    return FileResponse(
        path=file_path,
        filename=file.original_filename,
        media_type=file.mime_type or "application/octet-stream"
    )


@router.get("/public/welcome")
async def get_welcome_message():
    """
    獲取歡迎訊息（公開端點，無需認證）
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
