"""RAG 查詢 API 路由"""

import json
import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError

from app.core.database import get_db
from app.core.security import get_current_query_user_optional
from app.config import settings
from app.models.query_user import QueryUser
from app.models.query_history import QueryHistory
from app.schemas.rag import (
    QueryRequest,
    QueryResponse,
    DocumentSource
)
from app.services.rag.rag_engine import RAGEngine
from app.services.activity import activity_service

router = APIRouter(prefix="/rag", tags=["RAG查詢"])

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
    current_user: Optional[QueryUser] = Depends(get_current_query_user_optional)
):
    """RAG 查詢（公開端點，支援訪客和查詢用戶）
    
    此端點專用於前端查詢系統（rag_web_query），支援：
    - 訪客：只能訪問公開文件
    - 查詢用戶：可以訪問公開文件 + 被授權的文件
    
    後台管理員使用獨立的後台系統，不使用此端點
    """
    
    # 調試：檢查當前用戶狀態
    if current_user:
        print(f"🔐 [RAG Query] 已登入用戶: {current_user.username} (ID: {current_user.id})")
    else:
        print(f"👤 [RAG Query] 訪客查詢")
    
    try:
        # 決定處室 ID
        department_id = None
        if request.scope_ids and len(request.scope_ids) > 0:
            department_id = request.scope_ids[0]
        elif current_user and current_user.default_department_id:
            # 查詢用戶使用預設處室
            department_id = current_user.default_department_id
        else:
            raise HTTPException(
                status_code=400,
                detail="未登入用戶必須指定 scope_ids"
            )
        
        # 處理分類過濾：如果有指定 category_ids，查詢符合條件的檔案清單
        allowed_filenames = None  # None 表示不過濾（查詢所有檔案）
        
        # 訪客權限過濾：只能訪問公開文件
        if current_user is None:
            from app.models.file import File as FileModel
            
            # 獲取公開文件列表
            public_query = select(FileModel.original_filename).where(
                FileModel.department_id == department_id,
                FileModel.is_public == True,
                FileModel.is_vectorized == True
            )
            
            public_result = await db.execute(public_query)
            allowed_filenames = {row[0] for row in public_result.all()}
            
            if not allowed_filenames:
                # 該處室沒有公開文件
                return QueryResponse(
                    query=request.query,
                    answer="抱歉，目前沒有可供查詢的公開資料。請登入以訪問更多內容。",
                    sources=[]
                )
        
        # 查詢用戶權限過濾：公開文件 + 被授權的文件
        elif isinstance(current_user, QueryUser):
            # 查詢用戶可以訪問：公開文件 + 被授權的文件
            from app.models.file import File as FileModel
            from app.models.query_user import FilePermission
            
            # 1. 獲取公開文件
            public_query = select(FileModel.original_filename).where(
                FileModel.department_id == department_id,
                FileModel.is_public == True,
                FileModel.is_vectorized == True
            )
            public_result = await db.execute(public_query)
            public_filenames = {row[0] for row in public_result.all()}
            
            # 2. 獲取用戶被授權的文件
            permission_query = select(FileModel.original_filename).join(
                FilePermission,
                FileModel.id == FilePermission.file_id
            ).where(
                FilePermission.query_user_id == current_user.id,
                FileModel.department_id == department_id,
                FileModel.is_vectorized == True
            )
            
            permission_result = await db.execute(permission_query)
            authorized_filenames = {row[0] for row in permission_result.all()}
            
            # 3. 合併：公開文件 + 授權文件
            allowed_filenames = public_filenames | authorized_filenames
            
            if not allowed_filenames:
                # 沒有任何可訪問的文件
                return QueryResponse(
                    query=request.query,
                    answer="抱歉，您目前沒有權限訪問任何文件。請聯繫管理員獲取訪問權限。",
                    sources=[]
                )
        
        # 分類過濾（對所有用戶類型生效）
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
                FileModel.is_vectorized == True
            )
            
            # 根據用戶類型進行不同的過濾
            if current_user is None:
                # 訪客：只看公開文件 + 分類過濾
                file_query = file_query.where(FileModel.is_public == True)
                file_result = await db.execute(file_query)
                allowed_filenames = {row[0] for row in file_result.all()}
            else:
                # 查詢用戶：已有權限列表（公開+授權），與分類過濾求交集
                file_result = await db.execute(file_query)
                category_filenames = {row[0] for row in file_result.all()}
                allowed_filenames = allowed_filenames & category_filenames  # 交集
            
            if not allowed_filenames:
                # 沒有符合條件的檔案
                msg = "抱歉，在選定的分類中找不到"
                if current_user is None:
                    msg += "公開的"
                else:
                    msg += "您有權限訪問的"
                msg += "相關資訊。"
                return QueryResponse(
                    query=request.query,
                    answer=msg,
                    sources=[]
                )
        
        # 動態初始化對應處室的 RAG 引擎
        base_path = f"uploads/{department_id}/processed"
        try:
            dept_rag_engine = RAGEngine(base_path=base_path, debug_mode=True)
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"處室 {department_id} 的 RAG 引擎未初始化，請確認系統配置和 embeddings 資料"
            )
        
        start_time = time.time()
        
        # Execute RAG query with async implementation
        result = await dept_rag_engine.query(
            question=request.query,
            top_k=250,
            include_similarity_scores=True,
            allowed_filenames=allowed_filenames
        )
        
        processing_time = time.time() - start_time
        
        # Convert sources to API format
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
                print(f"⚠️ Warning: File record not found for {original_filename}")
                continue
            
            doc_source = DocumentSource(
                file_id=file_record.id,
                file_name=original_filename,
                source_link=source.get('source_link', ''),
                download_link=f"/public/files/{file_record.id}/download"
            )
            sources.append(doc_source)
        
        # Log activity and save query history
        if current_user:
            # 查詢用戶（記錄到 query_history）
            try:
                query_history = QueryHistory(
                    user_id=None,  # 查詢用戶不關聯到 user_id（user_id 保留給後台管理員）
                    department_id=department_id,
                    query=request.query,
                    answer=result['answer'],
                    processing_time=processing_time,
                    source_count=len(sources),
                    query_type="semantic",
                    scope="query_user",
                    extra_data={
                        "query_user_id": current_user.id,
                        "query_user_name": current_user.username,
                        "category_ids": request.category_ids or [],
                        "scope_ids": request.scope_ids or [],
                        "retrieved_docs": result.get('retrieved_docs', 0)
                    }
                )
                db.add(query_history)
                await db.commit()
                print(f"✅ QueryHistory saved (query_user): query_id={query_history.id}, user={current_user.username}")
            except Exception as e:
                print(f"❌ Failed to save QueryHistory for query_user: {e}")
                await db.rollback()
        else:
            # 訪客
            try:
                anonymous_history = QueryHistory(
                    user_id=None,
                    department_id=department_id,
                    query=request.query,
                    answer=result['answer'],
                    processing_time=processing_time,
                    source_count=len(sources),
                    query_type="semantic",
                    scope="anonymous",
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
                await db.rollback()

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
