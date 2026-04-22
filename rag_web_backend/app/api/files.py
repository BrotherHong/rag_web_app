"""檔案管理 API 路由"""

import os
import json
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
from app.models.user import User, UserRole
from app.models.file import File as FileModel
from app.models.category import Category
from app.models.user_group import FileUserGroupPermission
from app.models.admin_group import AdminGroup
from app.schemas.file import (
    FileListResponse,
    FileSchema,
    FileUploadResponse,
    FileDetailResponse,
    FileUpdate,
)
from app.services.file_storage import file_storage
from app.services.activity import activity_service
from app.models.file import FileStatus as ProcessingStatus

router = APIRouter(prefix="/files", tags=["files"])


def _check_admin_file_permission(user: User, file: FileModel) -> None:
    """檢查管理員是否有權限操作（更新/刪除）此檔案。
    
    - SuperAdmin：全部可操作
    - 有管理組織的 Admin：只能操作同組織的檔案
    - 無管理組織的 Admin：只能操作 admin_group_id 為 null 的檔案
    """
    if user.role == UserRole.SUPER_ADMIN:
        return
    if user.admin_group_id is None:
        if file.admin_group_id is not None:
            raise HTTPException(status_code=403, detail="無管理組織的管理員只能操作未指定組織的檔案")
    else:
        if file.admin_group_id != user.admin_group_id:
            raise HTTPException(status_code=403, detail="無權限操作不屬於您管理組織的檔案")


@router.get("/", response_model=FileListResponse)
async def get_files(
    page: int = Query(1, ge=1, description="頁碼"),
    limit: int = Query(10, ge=1, le=10000, description="每頁數量"),
    category_id: Optional[int] = Query(None, description="分類ID篩選"),
    admin_group_id: Optional[int] = Query(None, description="管理組織ID篩選（-1 表示無組織）"),
    search: Optional[str] = Query(None, description="搜尋檔名或描述"),
    sort: str = Query("created_at", pattern="^(filename|created_at|file_size)$", description="排序欄位"),
    order: str = Query("desc", pattern="^(asc|desc)$", description="排序方向"),
    status: Optional[str] = Query(None, description="狀態篩選"),
    include_inactive: bool = Query(False, description="是否包含未完成或未向量化檔案"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得檔案列表
    
    - 自動過濾處室：只能看到自己處室的檔案
    - 非 SuperAdmin 的 Admin 依管理組織自動限制可見範圍
    - 支援分類、狀態、管理組織篩選
    - 支援搜尋檔名和描述
    """
    query = select(FileModel).where(
        FileModel.department_id == current_user.department_id
    ).options(
        joinedload(FileModel.category),
        joinedload(FileModel.uploader),
        joinedload(FileModel.admin_group),
    )

    # 預設僅顯示可用於知識庫查詢的檔案
    if not include_inactive and not status:
        query = query.where(
            FileModel.status == ProcessingStatus.COMPLETED,
            FileModel.is_vectorized.is_(True)
        )

    # 管理組織篩選（SuperAdmin 可用此參數過濾，-1 = 無組織檔案）
    if admin_group_id is not None:
        if admin_group_id == -1:
            query = query.where(FileModel.admin_group_id.is_(None))
        else:
            query = query.where(FileModel.admin_group_id == admin_group_id)

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


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(..., description="上傳的檔案"),
    category_id: Optional[int] = Form(None, description="分類ID"),
    description: Optional[str] = Form(None, description="檔案描述"),
    user_group_ids: Optional[str] = Form(None, description="身分組ID列表（JSON字串）"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """上傳檔案
    
    - 支援的檔案格式：PDF, DOCX, TXT, MD
    - 最大檔案大小：50MB
    - 自動生成唯一檔名
    - 儲存到處室專屬目錄
    - 支援設定身分組權限
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
        admin_group_id=current_user.admin_group_id,
        description=description,
        status="pending"  # 等待背景處理
    )
    
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)
    
    # 6. 處理身分組權限
    if user_group_ids:
        try:
            group_ids = json.loads(user_group_ids)
            if isinstance(group_ids, list):
                for group_id in group_ids:
                    permission = FileUserGroupPermission(
                        file_id=db_file.id,
                        user_group_id=group_id
                    )
                    db.add(permission)
                await db.commit()
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Warning: Failed to set user group permissions: {e}")
    
    # 7. 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="UPLOAD",
        description=f"上傳檔案: {file.filename}",
        file_id=db_file.id,
        department_id=current_user.department_id
    )
    
    # 8. 設置檔案為待處理狀態
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
    if file.department_id != current_user.department_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="無權限查看此檔案")
    
    return FileDetailResponse.model_validate(file)


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

    # 處室權限檢查
    if file.department_id != current_user.department_id:
        raise HTTPException(status_code=403, detail="無權限修改此檔案")

    # 管理組織權限檢查
    _check_admin_file_permission(current_user, file)
    
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
    
    # 更新公開狀態
    if file_data.is_public is not None:
        file.is_public = file_data.is_public
    
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

    # 處室權限檢查
    if file.department_id != current_user.department_id:
        raise HTTPException(status_code=403, detail="無權限刪除此檔案")

    # 管理組織權限檢查
    _check_admin_file_permission(current_user, file)

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
    
    # 權限檢查：處室
    if file.department_id != current_user.department_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="無權限下載此檔案")
    
    # 權限檢查：管理組織
    _check_admin_file_permission(current_user, file)
    
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

