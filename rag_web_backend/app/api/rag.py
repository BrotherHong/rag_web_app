"""RAG 查詢 API 路由"""

import json
import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError

from app.core.database import get_db
from app.core.security import get_current_user
from app.config import settings
from app.models.user import User
from app.models.query_history import QueryHistory
from app.schemas.rag import (
    QueryRequest,
    QueryResponse,
    DocumentSource
)
from app.services.rag.rag_engine import RAGEngine
from app.services.activity import activity_service

router = APIRouter(prefix="/rag", tags=["RAG查詢"])


# 可選認證：允許匿名訪問
async def get_current_user_optional(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    可選的用戶認證
    如果提供 token 則驗證，否則返回 None（匿名用戶）
    """
    if not authorization:
        return None
    
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id = payload.get("sub")
        
        if user_id:
            result = await db.execute(select(User).where(User.id == int(user_id)))
            return result.scalar_one_or_none()
    except (JWTError, ValueError):
        pass
    
    return None

# TODO: Support multiple departments - currently hardcoded to department 1 (人事室)
DEPARTMENT_ID = 1
BASE_PATH = f"uploads/{DEPARTMENT_ID}/processed"

# Initialize RAG Engine
try:
    rag_engine = RAGEngine(base_path=BASE_PATH, debug_mode=True)  # 開啟 debug 模式
    print(f"✅ RAG Engine initialized with base_path: {BASE_PATH}")
except Exception as e:
    print(f"⚠️ Warning: Failed to initialize RAG Engine: {e}")
    rag_engine = None


@router.post("/query", response_model=QueryResponse)
async def query_documents(
    request: QueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """RAG 查詢（公開端點，無需認證）
    
    - 使用語義搜尋找到相關文檔
    - 生成基於文檔的答案（使用真實 LLM）
    - 自動記錄查詢歷史（如果已登入）
    - 支援處室資料過濾
    """
    
    try:
        # 決定處室 ID：優先使用 scope_ids[0]，否則使用已登入用戶的處室
        department_id = None
        if request.scope_ids and len(request.scope_ids) > 0:
            department_id = request.scope_ids[0]
        elif current_user and current_user.department_id:
            department_id = current_user.department_id
        else:
            raise HTTPException(
                status_code=400,
                detail="未登入用戶必須指定 scope_ids"
            )
        
        # 處理分類過濾：如果有指定 category_ids，查詢符合條件的檔案清單
        allowed_filenames = None  # None 表示不過濾（查詢所有檔案）
        if request.category_ids:
            from app.models.category import Category
            from app.models.file import File as FileModel
            
            # 1. 找出該處室的「其他」分類 ID
            other_category_query = select(Category.id).where(
                Category.department_id == department_id,
                Category.name == "其他"
            )
            other_category_result = await db.execute(other_category_query)
            other_category_id = other_category_result.scalar_one_or_none()
            
            # 2. 建立完整的分類 ID 清單（使用者選的 + 「其他」）
            filter_category_ids = list(request.category_ids)
            if other_category_id and other_category_id not in filter_category_ids:
                filter_category_ids.append(other_category_id)
            
            # 3. 查詢符合分類條件的檔案
            file_query = select(FileModel.original_filename).where(
                FileModel.department_id == department_id,
                FileModel.category_id.in_(filter_category_ids),
                FileModel.is_vectorized == True  # 只查詢已向量化的檔案
            )
            file_result = await db.execute(file_query)
            allowed_filenames = {row[0] for row in file_result.all()}  # 使用 set 加速查詢
            
            if not allowed_filenames:
                # 沒有符合條件的檔案，直接回傳空結果
                return QueryResponse(
                    query=request.query,
                    answer="抱歉，在選定的分類中找不到相關資訊。",
                    sources=[]
                )
        
        # 動態初始化對應處室的 RAG 引擎
        base_path = f"uploads/{department_id}/processed"
        try:
            dept_rag_engine = RAGEngine(base_path=base_path, debug_mode=True)  # 開啟 debug 模式
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"處室 {department_id} 的 RAG 引擎未初始化，請確認系統配置和 embeddings 資料"
            )
        
        start_time = time.time()
        
        # Execute RAG query with real implementation (top_k fixed at 250)
        result = dept_rag_engine.query(
            question=request.query,
            top_k=250,
            include_similarity_scores=True,  # Include scores for metadata
            allowed_filenames=allowed_filenames  # 傳遞檔案過濾清單
        )
        
        processing_time = time.time() - start_time
        
        # Convert sources to API format and fetch file_id from database
        sources = []
        for source in result['sources']:
            original_filename = source['filename']
            
            # Query database to find file_id
            from app.models.file import File as FileModel
            file_query = select(FileModel).where(
                FileModel.department_id == department_id,
                FileModel.original_filename == original_filename
            )
            file_result = await db.execute(file_query)
            file_record = file_result.scalar_one_or_none()
            
            if not file_record:
                # This should not happen - file record must exist for processed files
                print(f"⚠️ Warning: File record not found for {original_filename}")
                continue
            
            doc_source = DocumentSource(
                file_id=file_record.id,
                file_name=original_filename,
                source_link=source.get('source_link', ''),
                download_link=f"/public/files/{file_record.id}/download"  # 移除 /api 前綴，由前端的 BASE_URL 提供
            )
            sources.append(doc_source)
        
        # Log activity (only if user is authenticated)
        if current_user:
            await activity_service.log_activity(
                db=db,
                user_id=current_user.id,
                activity_type="query",
                description=f"查詢: {request.query[:50]}...",
                department_id=current_user.department_id,
                extra_data=json.dumps({
                    "source_count": len(sources),
                    "retrieved_docs": result.get('retrieved_docs', 0),
                    "query_department_id": department_id
                })
            )
            
            # 記錄到 QueryHistory (只記錄已登入使用者)
            query_history = QueryHistory(
                user_id=current_user.id,
                department_id=department_id,
                query=request.query,
                answer=result['answer'],
                processing_time=processing_time,
                source_count=len(sources),
                query_type="semantic",
                scope="all",
                extra_data={
                    "category_ids": request.category_ids or [],
                    "scope_ids": request.scope_ids or [],
                    "retrieved_docs": result.get('retrieved_docs', 0)
                }
            )
            db.add(query_history)
            await db.commit()
            print(f"✅ QueryHistory saved: query_id={query_history.id}, user_id={current_user.id}")
        else:
            try:
                anonymous_history = QueryHistory(
                    user_id=None,
                    department_id=department_id,
                    query=request.query,
                    answer=result['answer'],
                    processing_time=processing_time,
                    source_count=len(sources),
                    query_type="semantic",
                    scope="all",
                    extra_data={
                        "category_ids": request.category_ids or [],
                        "scope_ids": request.scope_ids or [],
                        "retrieved_docs": result.get('retrieved_docs', 0)
                    }
                )
                db.add(anonymous_history)
                await db.commit()
                print(f"✅ QueryHistory saved (anonymous): query_id={anonymous_history.id}")
            except Exception as e:
                print(f"❌ Failed to save anonymous QueryHistory: {e}")
                import traceback
                traceback.print_exc()
                await db.rollback()

        # Return simplified response
        return QueryResponse(
            query=request.query,
            answer=result['answer'],
            sources=sources
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"參數錯誤: {str(e)}"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"查詢處理失敗: {str(e)}"
        )
