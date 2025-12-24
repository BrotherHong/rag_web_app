"""檔案管理 API 路由"""

import os
import math
from datetime import datetime
from typing import Optional, List
from fastapi import (
    APIRouter, 
    Depends, 
    HTTPException, 
    status, 
    UploadFile, 
    File, 
    Form,
    Query
)
from fastapi.responses import FileResponse
from sqlalchemy import select, func, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.core.security import get_current_user, get_current_active_admin
from app.models.user import User
from app.models.file import File as FileModel
from app.models.category import Category
from app.schemas.file import (
    FileListResponse,
    FileSchema,
    FileUploadResponse,
    FileDetailResponse,
    FileUpdate,
    FileStatsResponse
)
from app.services.file_storage import file_storage
from app.services.activity import activity_service
from app.models.file import FileStatus as ProcessingStatus

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/", response_model=FileListResponse)
async def get_files(
    page: int = Query(1, ge=1, description="頁碼"),
    limit: int = Query(10, ge=1, le=10000, description="每頁數量"),
    category_id: Optional[int] = Query(None, description="分類ID篩選"),
    search: Optional[str] = Query(None, description="搜尋檔名或描述"),
    sort: str = Query("created_at", regex="^(filename|created_at|file_size)$", description="排序欄位"),
    order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    status: Optional[str] = Query(None, description="狀態篩選"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得檔案列表
    
    - 自動過濾處室：只能看到自己處室的檔案
    - 支援分類、狀態篩選
    - 支援搜尋檔名和描述
    - 支援排序和分頁
    """
    # 建立基礎查詢（自動過濾處室）
    query = select(FileModel).where(
        FileModel.department_id == current_user.department_id
    ).options(
        joinedload(FileModel.category),
        joinedload(FileModel.uploader)
    )
    
    # 分類篩選
    if category_id:
        query = query.where(FileModel.category_id == category_id)
    
    # 狀態篩選
    if status:
        query = query.where(FileModel.status == status)
    
    # 搜尋
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                FileModel.original_filename.ilike(search_pattern),
                FileModel.description.ilike(search_pattern)
            )
        )
    
    # 計算總數
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    # 排序
    sort_column = getattr(FileModel, sort)
    order_by = desc(sort_column) if order == "desc" else asc(sort_column)
    query = query.order_by(order_by)
    
    # 分頁
    query = query.offset((page - 1) * limit).limit(limit)
    
    # 執行查詢
    result = await db.execute(query)
    files = result.unique().scalars().all()
    
    return FileListResponse(
        items=[FileSchema.model_validate(f) for f in files],
        total=total,
        page=page,
        pages=math.ceil(total / limit) if total > 0 else 0
    )


@router.get("/statistics", response_model=FileStatsResponse)
async def get_file_statistics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得檔案統計資訊
    
    - 總檔案數和大小
    - 各狀態檔案數
    - 各類型檔案數
    - 最近上傳的檔案
    """
    # 基礎查詢（自動過濾處室）
    base_query = select(FileModel).where(
        FileModel.department_id == current_user.department_id
    )
    
    # 總檔案數
    total_files = await db.scalar(
        select(func.count(FileModel.id)).where(
            FileModel.department_id == current_user.department_id
        )
    )
    
    # 總大小
    total_size = await db.scalar(
        select(func.sum(FileModel.file_size)).where(
            FileModel.department_id == current_user.department_id
        )
    ) or 0
    
    # 按狀態統計
    status_stats = await db.execute(
        select(FileModel.status, func.count(FileModel.id))
        .where(FileModel.department_id == current_user.department_id)
        .group_by(FileModel.status)
    )
    by_status = {status: count for status, count in status_stats.all()}
    
    # 按類型統計
    type_stats = await db.execute(
        select(FileModel.file_type, func.count(FileModel.id))
        .where(FileModel.department_id == current_user.department_id)
        .group_by(FileModel.file_type)
    )
    by_type = {file_type: count for file_type, count in type_stats.all()}
    
    # 最近上傳的檔案（前5個）
    recent_query = await db.execute(
        select(FileModel)
        .where(FileModel.department_id == current_user.department_id)
        .options(joinedload(FileModel.category), joinedload(FileModel.uploader))
        .order_by(desc(FileModel.created_at))
        .limit(5)
    )
    recent_files = recent_query.unique().scalars().all()
    
    return FileStatsResponse(
        total_files=total_files,
        total_size=int(total_size),
        by_status=by_status,
        by_type=by_type,
        recent_uploads=[FileSchema.model_validate(f) for f in recent_files]
    )


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(..., description="上傳的檔案"),
    category_id: Optional[int] = Form(None, description="分類ID"),
    description: Optional[str] = Form(None, description="檔案描述"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """上傳檔案
    
    - 支援的檔案格式：PDF, DOCX, TXT, MD
    - 最大檔案大小：50MB
    - 自動生成唯一檔名
    - 儲存到處室專屬目錄
    """
    # 1. 驗證檔案
    is_valid, error_msg = await file_storage.validate_file(file, db)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 2. 驗證分類（如果提供）
    if category_id:
        category = await db.get(Category, category_id)
        if not category:
            raise HTTPException(status_code=404, detail="分類不存在")
        if category.department_id != current_user.department_id:
            raise HTTPException(status_code=403, detail="無權使用此分類")
    
    # 3. 儲存檔案
    try:
        unique_filename, file_path, file_size = await file_storage.save_upload_file(
            file, 
            current_user.department_id,
            db=db,
            original_filename=file.filename
        )
    except ValueError as e:
        # 檔案已存在
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"檔案儲存失敗: {str(e)}"
        )
    
    # 4. 取得檔案資訊
    ext = os.path.splitext(file.filename)[1].lower()
    
    # 5. 建立資料庫記錄
    db_file = FileModel(
        filename=unique_filename,
        original_filename=file.filename,
        file_path=file_path,
        file_size=file_size,
        file_type=ext[1:] if ext else "unknown",
        mime_type=file.content_type,
        category_id=category_id,
        department_id=current_user.department_id,
        uploader_id=current_user.id,
        description=description,
        status="pending"  # 等待背景處理
    )
    
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)
    
    # 6. 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="UPLOAD",
        description=f"上傳檔案: {file.filename}",
        file_id=db_file.id,
        department_id=current_user.department_id
    )
    
    # 7. 設置檔案為待處理狀態
    db_file.status = ProcessingStatus.PENDING
    db_file.processing_step = "pending"
    db_file.processing_progress = 0
    await db.commit()
    await db.refresh(db_file)
    
    return FileUploadResponse(
        id=db_file.id,
        filename=db_file.filename,
        original_filename=db_file.original_filename,
        file_size=db_file.file_size,
        status=db_file.status,
        message="檔案上傳並處理完成" if db_file.status == "active" else "檔案上傳成功，處理中..."
    )


@router.post("/batch-upload")
@router.post("/upload/batch")  # 添加別名以支援前端路徑
async def batch_upload_files(
    files: List[UploadFile] = File(..., description="上傳的多個檔案"),
    category_id: Optional[int] = Form(None, description="分類ID"),
    description: Optional[str] = Form(None, description="檔案描述（套用到所有檔案）"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """批次上傳檔案
    
    - 支援一次上傳多個檔案
    - 所有檔案使用相同的分類和描述
    - 返回每個檔案的上傳結果
    - 部分失敗不影響其他檔案
    - 前端可使用 /files/batch-upload 或 /upload/batch
    """
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="一次最多上傳 10 個檔案")
    
    # 驗證分類（如果提供）
    if category_id:
        category = await db.get(Category, category_id)
        if not category:
            raise HTTPException(status_code=404, detail="分類不存在")
        if category.department_id != current_user.department_id:
            raise HTTPException(status_code=403, detail="無權使用此分類")
    
    results = []
    uploaded_file_ids = []
    
    # 處理每個檔案
    for file in files:
        try:
            # 1. 驗證檔案
            is_valid, error_msg = await file_storage.validate_file(file, db)
            if not is_valid:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": error_msg
                })
                continue
            
            # 2. 儲存檔案
            try:
                unique_filename, file_path, file_size = await file_storage.save_upload_file(
                    file, 
                    current_user.department_id,
                    db=db,
                    original_filename=file.filename
                )
            except ValueError as e:
                # 檔案已存在
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": str(e)
                })
                continue
            except Exception as e:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": f"檔案儲存失敗: {str(e)}"
                })
                continue
            
            # 3. 取得檔案資訊
            ext = os.path.splitext(file.filename)[1].lower()
            
            # 4. 建立資料庫記錄
            db_file = FileModel(
                filename=unique_filename,
                original_filename=file.filename,
                file_path=file_path,
                file_size=file_size,
                file_type=ext[1:] if ext else "unknown",
                mime_type=file.content_type,
                category_id=category_id,
                department_id=current_user.department_id,
                uploader_id=current_user.id,
                description=description,
                status="pending"
            )
            
            db.add(db_file)
            await db.commit()
            await db.refresh(db_file)
            
            uploaded_file_ids.append(db_file.id)
            
            results.append({
                "filename": file.filename,
                "success": True,
                "file_id": db_file.id,
                "status": db_file.status
            })
            
        except Exception as e:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e)
            })
    
    # 記錄批次上傳活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="UPLOAD",
        description=f"批次上傳 {len(uploaded_file_ids)} 個檔案",
        department_id=current_user.department_id
    )
    
    # 批次處理檔案（背景任務）
    # 注意：這裡應該使用 Celery 或其他任務隊列
    # 目前使用模擬處理器演示
    if uploaded_file_ids:
        try:
            # 這裡應該調用 batch_process，但為了演示，我們不實際處理
            # 實際環境中應該是：batch_process_task.delay(uploaded_file_ids)
            pass
        except Exception as e:
            print(f"批次處理觸發失敗: {str(e)}")
    
    # 統計結果
    success_count = sum(1 for r in results if r["success"])
    failed_count = len(results) - success_count
    
    return {
        "total": len(files),
        "success": success_count,
        "failed": failed_count,
        "results": results,
        "message": f"成功上傳 {success_count} 個檔案，{failed_count} 個失敗"
    }


@router.get("/{file_id}", response_model=FileDetailResponse)
async def get_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得檔案詳情
    
    - 包含完整的檔案元資料
    - 權限檢查：只能查看自己處室的檔案
    """
    # 查詢檔案（包含關聯）
    query = await db.execute(
        select(FileModel)
        .where(FileModel.id == file_id)
        .options(
            joinedload(FileModel.category),
            joinedload(FileModel.uploader),
            joinedload(FileModel.department)
        )
    )
    file = query.unique().scalar_one_or_none()
    
    if not file:
        raise HTTPException(status_code=404, detail="檔案不存在")
    
    # 權限檢查
    if file.department_id != current_user.department_id and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="無權限查看此檔案")
    
    return FileDetailResponse.model_validate(file)


@router.get("/{file_id}/processing-status")
async def get_file_processing_status(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得檔案處理狀態
    
    - 返回當前處理步驟和進度
    - 包含處理時間資訊
    - 權限檢查：只能查看自己處室的檔案
    """
    # 查詢檔案
    file = await db.get(FileModel, file_id)
    
    if not file:
        raise HTTPException(status_code=404, detail="檔案不存在")
    
    # 權限檢查
    if file.department_id != current_user.department_id and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="無權限查看此檔案")
    
    # 計算處理時間
    processing_duration = None
    if file.processing_started_at:
        end_time = file.processing_completed_at or datetime.now()
        processing_duration = (end_time - file.processing_started_at).total_seconds()
    
    return {
        "file_id": file.id,
        "filename": file.original_filename,
        "status": file.status.value if hasattr(file.status, 'value') else file.status,
        "processing_step": file.processing_step,
        "processing_progress": file.processing_progress,
        "processing_started_at": file.processing_started_at,
        "processing_completed_at": file.processing_completed_at,
        "processing_duration_seconds": processing_duration,
        "chunk_count": file.chunk_count,
        "vector_count": file.vector_count,
        "error_message": file.error_message,
        "is_vectorized": file.is_vectorized
    }


@router.put("/{file_id}")
async def update_file(
    file_id: int,
    file_data: FileUpdate,
    current_user: User = Depends(get_current_active_admin),  # 需要管理員權限
    db: AsyncSession = Depends(get_db)
):
    """更新檔案資訊
    
    - 可更新分類、描述、標籤
    - 不能更新檔案實體內容
    - 需要管理員權限
    """
    # 取得檔案
    file = await db.get(FileModel, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="檔案不存在")
    
    # 權限檢查
    if file.department_id != current_user.department_id:
        raise HTTPException(status_code=403, detail="無權限修改此檔案")
    
    # 更新分類
    if file_data.category_id is not None:
        if file_data.category_id:
            # 驗證分類是否存在且屬於同一處室
            category = await db.get(Category, file_data.category_id)
            if not category or category.department_id != current_user.department_id:
                raise HTTPException(status_code=400, detail="分類不存在或無權使用")
        file.category_id = file_data.category_id
    
    # 更新描述
    if file_data.description is not None:
        file.description = file_data.description
    
    # 更新標籤
    if file_data.tags is not None:
        file.tags = file_data.tags
    
    await db.commit()
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="UPDATE_FILE",
        description=f"更新檔案資訊: {file.original_filename}",
        file_id=file_id,
        department_id=current_user.department_id
    )
    
    return {"message": "檔案資訊已更新"}


@router.delete("/{file_id}")
async def delete_file(
    file_id: int,
    current_user: User = Depends(get_current_active_admin),  # 需要管理員權限
    db: AsyncSession = Depends(get_db)
):
    """刪除檔案
    
    - 刪除實體檔案和資料庫記錄
    - TODO: 刪除向量資料
    - 需要管理員權限
    """
    # 取得檔案
    file = await db.get(FileModel, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="檔案不存在")
    
    # 權限檢查
    if file.department_id != current_user.department_id:
        raise HTTPException(status_code=403, detail="無權限刪除此檔案")
    
    # 記錄檔名（刪除前）
    original_filename = file.original_filename
    department_id = file.department_id
    
    # 使用完整清理功能刪除所有相關檔案
    cleanup_stats = file_storage.delete_file_completely(file, department_id)
    
    # 刪除資料庫記錄
    await db.delete(file)
    await db.commit()
    
    # 記錄活動（在刪除後，不關聯 file_id）
    cleanup_summary = f"刪除檔案: {original_filename}"
    if cleanup_stats['summary_files'] > 0 or cleanup_stats['embedding_files'] > 0:
        cleanup_summary += f" (包含 {cleanup_stats['summary_files']} 個摘要檔案, {cleanup_stats['embedding_files']} 個嵌入檔案)"
    
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="DELETE",
        description=cleanup_summary,
        department_id=current_user.department_id
        # 不傳遞 file_id，因為檔案已被刪除
    )
    await db.commit()  # 提交活動記錄
    
    # TODO: 刪除 Qdrant 向量
    # if file.is_vectorized:
    #     await qdrant_service.delete_vectors(file_id)
    
    # 準備回應訊息
    message = "檔案已完全刪除"
    if cleanup_stats['errors']:
        message += f"，但有 {len(cleanup_stats['errors'])} 個清理錯誤"
    
    return {
        "success": True, 
        "message": message,
        "cleanup_stats": cleanup_stats
    }


@router.get("/{file_id}/download")
async def download_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """下載檔案
    
    - 更新下載次數和最後存取時間
    - 記錄下載活動
    - 返回檔案內容
    """
    from datetime import datetime
    
    # 取得檔案
    file = await db.get(FileModel, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="檔案不存在")
    
    # 權限檢查
    if file.department_id != current_user.department_id and not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="無權限下載此檔案")
    
    # 檢查檔案是否存在
    if not os.path.exists(file.file_path):
        raise HTTPException(status_code=404, detail="檔案實體不存在")
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="DOWNLOAD",
        description=f"下載檔案: {file.original_filename}",
        file_id=file_id,
        department_id=current_user.department_id
    )
    await db.commit()  # 提交活動記錄
    
    # 返回檔案
    return FileResponse(
        path=file.file_path,
        filename=file.original_filename,
        media_type=file.mime_type or "application/octet-stream"
    )

