"""後台查詢用戶管理 API 路由

供後台管理員使用，用於審批註冊申請、管理查詢用戶、分配文件權限等
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from math import ceil

from app.core.database import get_db
from app.core.security import get_current_super_admin, get_password_hash
from app.models.user import User
from app.models.query_user import QueryUser, QueryUserStatus, FilePermission
from app.models.file import File
from app.models.category import Category
from app.schemas.query_user import (
    QueryUserDetail,
    QueryUserListResponse,
    QueryUserApprovalRequest,
    QueryUserCreateRequest,
    QueryUserUpdateRequest,
    QueryUserStats,
    FilePermissionCreate,
    FilePermissionBatchCreate,
    FilePermissionInfo,
    FilePermissionDetail,
    FilePermissionListResponse
)

router = APIRouter(prefix="/query-users", tags=["查詢用戶管理"])


@router.get("/stats", response_model=QueryUserStats)
async def get_query_user_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    獲取查詢用戶統計資訊
    
    需要管理員權限
    """
    # 總數
    total_result = await db.execute(select(func.count(QueryUser.id)))
    total = total_result.scalar()
    
    # 各狀態數量
    pending_result = await db.execute(
        select(func.count(QueryUser.id)).where(QueryUser.status == QueryUserStatus.PENDING)
    )
    pending = pending_result.scalar()
    
    approved_result = await db.execute(
        select(func.count(QueryUser.id)).where(QueryUser.status == QueryUserStatus.APPROVED)
    )
    approved = approved_result.scalar()
    
    rejected_result = await db.execute(
        select(func.count(QueryUser.id)).where(QueryUser.status == QueryUserStatus.REJECTED)
    )
    rejected = rejected_result.scalar()
    
    suspended_result = await db.execute(
        select(func.count(QueryUser.id)).where(QueryUser.status == QueryUserStatus.SUSPENDED)
    )
    suspended = suspended_result.scalar()
    
    # 啟用/停用數量
    active_result = await db.execute(
        select(func.count(QueryUser.id)).where(QueryUser.is_active == True)
    )
    active = active_result.scalar()
    
    inactive_result = await db.execute(
        select(func.count(QueryUser.id)).where(QueryUser.is_active == False)
    )
    inactive = inactive_result.scalar()
    
    return QueryUserStats(
        total=total,
        pending=pending,
        approved=approved,
        rejected=rejected,
        suspended=suspended,
        active=active,
        inactive=inactive
    )


@router.post("/create", response_model=QueryUserDetail, status_code=status.HTTP_201_CREATED)
async def create_query_user(
    user_data: QueryUserCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    管理員直接創建查詢用戶（無需審批）
    
    - 跳過審批流程，直接創建為 APPROVED 狀態
    - 需要管理員權限
    - 會檢查使用者名稱和電子郵件的唯一性
    """
    # 檢查使用者名稱是否已存在
    existing_username = await db.execute(
        select(QueryUser).where(QueryUser.username == user_data.username)
    )
    if existing_username.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="使用者名稱已存在"
        )
    
    # 檢查電子郵件是否已存在
    existing_email = await db.execute(
        select(QueryUser).where(QueryUser.email == user_data.email)
    )
    if existing_email.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="電子郵件已被使用"
        )
    
    # 創建查詢用戶
    query_user = QueryUser(
        username=user_data.username,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        organization=user_data.organization,
        status=QueryUserStatus.APPROVED,  # 直接設定為已審批
        is_active=True,
        default_department_id=user_data.default_department_id,
        admin_notes=user_data.admin_notes,
        approved_by=current_user.id,
        approved_at=datetime.utcnow()
    )
    
    db.add(query_user)
    await db.commit()
    
    # 重新查詢以預加載關聯
    result = await db.execute(
        select(QueryUser)
        .options(
            selectinload(QueryUser.approver),
            selectinload(QueryUser.default_department)
        )
        .where(QueryUser.id == query_user.id)
    )
    query_user = result.scalar_one()
    
    return QueryUserDetail.model_validate(query_user)


@router.get("/list", response_model=QueryUserListResponse)
async def list_query_users(
    page: int = Query(1, ge=1, description="頁碼"),
    limit: int = Query(20, ge=1, le=100, description="每頁筆數"),
    status: Optional[str] = Query(None, description="篩選狀態"),
    is_active: Optional[bool] = Query(None, description="篩選是否啟用"),
    search: Optional[str] = Query(None, description="搜尋用戶名稱、郵箱或全名"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    獲取查詢用戶列表（分頁）
    
    需要管理員權限
    """
    # 構建查詢
    query = select(QueryUser).options(
        selectinload(QueryUser.approver),
        selectinload(QueryUser.default_department)
    )
    
    # 狀態篩選
    if status:
        try:
            status_enum = QueryUserStatus(status)
            query = query.where(QueryUser.status == status_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"無效的狀態值: {status}"
            )
    
    # 啟用狀態篩選
    if is_active is not None:
        query = query.where(QueryUser.is_active == is_active)
    
    # 搜尋
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                QueryUser.username.ilike(search_pattern),
                QueryUser.email.ilike(search_pattern),
                QueryUser.full_name.ilike(search_pattern)
            )
        )
    
    # 獲取總數
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分頁
    offset = (page - 1) * limit
    query = query.order_by(QueryUser.created_at.desc()).offset(offset).limit(limit)
    
    # 執行查詢
    result = await db.execute(query)
    query_users = result.scalars().all()
    
    return QueryUserListResponse(
        items=[QueryUserDetail.model_validate(qu) for qu in query_users],
        total=total,
        page=page,
        limit=limit,
        pages=ceil(total / limit) if total > 0 else 0
    )


@router.get("/{user_id}", response_model=QueryUserDetail)
async def get_query_user_detail(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    獲取查詢用戶詳細資訊
    
    需要管理員權限
    """
    result = await db.execute(
        select(QueryUser)
        .options(
            selectinload(QueryUser.approver),
            selectinload(QueryUser.default_department)
        )
        .where(QueryUser.id == user_id)
    )
    query_user = result.scalar_one_or_none()
    
    if not query_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    return QueryUserDetail.model_validate(query_user)


@router.post("/{user_id}/approve")
async def approve_query_user(
    user_id: int,
    request: QueryUserApprovalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    審批查詢用戶申請
    
    需要管理員權限
    """
    # 獲取查詢用戶
    result = await db.execute(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    query_user = result.scalar_one_or_none()
    
    if not query_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    # 檢查是否已審批
    if query_user.status != QueryUserStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"該申請已處理（當前狀態：{query_user.status.value}）"
        )
    
    # 更新狀態
    if request.approve:
        query_user.status = QueryUserStatus.APPROVED
        query_user.approved_by = current_user.id
        query_user.approved_at = datetime.utcnow()
        query_user.default_department_id = request.default_department_id
        query_user.admin_notes = request.admin_notes
        message = "申請已批准"
    else:
        query_user.status = QueryUserStatus.REJECTED
        query_user.approved_by = current_user.id
        query_user.approved_at = datetime.utcnow()
        query_user.rejection_reason = request.rejection_reason
        query_user.admin_notes = request.admin_notes
        message = "申請已拒絕"
    
    await db.commit()
    await db.refresh(query_user)
    
    # TODO: 發送郵件通知用戶
    
    return {
        "success": True,
        "message": message,
        "user": QueryUserDetail.model_validate(query_user)
    }


@router.patch("/{user_id}")
async def update_query_user(
    user_id: int,
    request: QueryUserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    更新查詢用戶資訊
    
    需要管理員權限
    """
    # 獲取查詢用戶
    result = await db.execute(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    query_user = result.scalar_one_or_none()
    
    if not query_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    # 更新欄位
    if request.is_active is not None:
        query_user.is_active = request.is_active
    
    if request.default_department_id is not None:
        query_user.default_department_id = request.default_department_id
    
    if request.admin_notes is not None:
        query_user.admin_notes = request.admin_notes
    
    await db.commit()
    
    # 重新查詢以預加載關聯
    result = await db.execute(
        select(QueryUser)
        .options(
            selectinload(QueryUser.approver),
            selectinload(QueryUser.default_department)
        )
        .where(QueryUser.id == user_id)
    )
    query_user = result.scalar_one()
    
    return {
        "success": True,
        "message": "用戶資訊已更新",
        "user": QueryUserDetail.model_validate(query_user)
    }


@router.post("/{user_id}/suspend")
async def suspend_query_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    停用查詢用戶
    
    需要管理員權限
    """
    result = await db.execute(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    query_user = result.scalar_one_or_none()
    
    if not query_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    query_user.status = QueryUserStatus.SUSPENDED
    query_user.is_active = False
    
    await db.commit()
    
    return {
        "success": True,
        "message": "用戶已停用"
    }


@router.post("/{user_id}/activate")
async def activate_query_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    啟用查詢用戶
    
    需要管理員權限
    """
    result = await db.execute(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    query_user = result.scalar_one_or_none()
    
    if not query_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    if query_user.status == QueryUserStatus.SUSPENDED:
        query_user.status = QueryUserStatus.APPROVED
    
    query_user.is_active = True
    
    await db.commit()
    
    return {
        "success": True,
        "message": "用戶已啟用"
    }


@router.delete("/{user_id}")
async def delete_query_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    刪除查詢用戶
    
    需要管理員權限
    此操作會同時刪除該用戶的所有文件權限
    """
    result = await db.execute(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    query_user = result.scalar_one_or_none()
    
    if not query_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    await db.delete(query_user)
    await db.commit()
    
    return {
        "success": True,
        "message": "用戶已刪除"
    }


# ==================== 文件權限管理 ====================

@router.get("/available-files/{department_id}")
async def get_available_files_for_permissions(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    獲取可授權的文件列表（按分類分組）
    
    專門用於授權介面，返回指定處室的所有未公開文件，按分類分組
    
    需要超級管理員權限
    """
    # 查詢該處室的所有未公開文件，按分類分組
    query = select(File, Category).join(
        Category, File.category_id == Category.id
    ).where(
        and_(
            File.department_id == department_id,
            File.is_public == False  # 只返回未公開的文件
        )
    ).order_by(Category.name, File.original_filename)
    
    result = await db.execute(query)
    files_with_categories = result.all()
    
    # 按分類分組
    categories_dict = {}
    for file, category in files_with_categories:
        category_id = category.id
        
        if category_id not in categories_dict:
            categories_dict[category_id] = {
                "category_id": category_id,
                "category_name": category.name,
                "files": []
            }
        
        categories_dict[category_id]["files"].append({
            "id": file.id,
            "filename": file.original_filename,
            "file_size": file.file_size,
            "created_at": file.created_at.isoformat() if file.created_at else None
        })
    
    # 轉換為列表格式
    categories_list = list(categories_dict.values())
    
    return {
        "department_id": department_id,
        "categories": categories_list,
        "total_files": len(files_with_categories)
    }


@router.post("/{user_id}/permissions", response_model=FilePermissionInfo)
async def grant_file_permission(
    user_id: int,
    request: FilePermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    授予查詢用戶文件訪問權限
    
    需要管理員權限
    """
    # 檢查查詢用戶是否存在
    qu_result = await db.execute(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    if not qu_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    # 檢查文件是否存在
    file_result = await db.execute(
        select(File).where(File.id == request.file_id)
    )
    if not file_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文件不存在"
        )
    
    # 檢查權限是否已存在
    existing_result = await db.execute(
        select(FilePermission).where(
            and_(
                FilePermission.query_user_id == user_id,
                FilePermission.file_id == request.file_id
            )
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="該用戶已擁有此文件的訪問權限"
        )
    
    # 創建權限
    permission = FilePermission(
        query_user_id=user_id,
        file_id=request.file_id,
        granted_by=current_user.id,
        granted_at=datetime.utcnow(),
        notes=request.notes
    )
    
    db.add(permission)
    await db.commit()
    await db.refresh(permission)
    
    return FilePermissionInfo.model_validate(permission)


@router.post("/{user_id}/permissions/batch")
async def grant_file_permissions_batch(
    user_id: int,
    request: FilePermissionBatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    批量授予文件訪問權限
    
    需要管理員權限
    """
    # 檢查查詢用戶是否存在
    qu_result = await db.execute(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    if not qu_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    # 獲取已存在的權限
    existing_result = await db.execute(
        select(FilePermission.file_id).where(
            FilePermission.query_user_id == user_id
        )
    )
    existing_file_ids = set(row[0] for row in existing_result.fetchall())
    
    # 過濾出需要新增的文件 ID
    new_file_ids = [fid for fid in request.file_ids if fid not in existing_file_ids]
    
    if not new_file_ids:
        return {
            "success": True,
            "message": "所有文件權限已存在",
            "granted": 0,
            "skipped": len(request.file_ids)
        }
    
    # 批量創建權限
    permissions = [
        FilePermission(
            query_user_id=user_id,
            file_id=file_id,
            granted_by=current_user.id,
            granted_at=datetime.utcnow(),
            notes=request.notes
        )
        for file_id in new_file_ids
    ]
    
    db.add_all(permissions)
    await db.commit()
    
    return {
        "success": True,
        "message": f"已授予 {len(new_file_ids)} 個文件的訪問權限",
        "granted": len(new_file_ids),
        "skipped": len(existing_file_ids & set(request.file_ids))
    }


@router.get("/{user_id}/permissions", response_model=FilePermissionListResponse)
async def list_user_file_permissions(
    user_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    獲取用戶的文件權限列表
    
    需要管理員權限
    """
    # 檢查用戶是否存在
    qu_result = await db.execute(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    if not qu_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    # 構建查詢
    query = select(FilePermission).options(
        selectinload(FilePermission.file).selectinload(File.category),
        selectinload(FilePermission.file).selectinload(File.department),
        selectinload(FilePermission.granter)
    ).where(FilePermission.query_user_id == user_id)
    
    # 獲取總數
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分頁
    offset = (page - 1) * limit
    query = query.order_by(FilePermission.granted_at.desc()).offset(offset).limit(limit)
    
    # 執行查詢
    result = await db.execute(query)
    permissions = result.scalars().all()
    
    # 轉換為詳細資訊
    items = []
    for perm in permissions:
        item_dict = FilePermissionInfo.model_validate(perm).model_dump()
        item_dict["file_name"] = perm.file.original_filename if perm.file else None
        item_dict["category_name"] = perm.file.category.name if perm.file and perm.file.category else None
        item_dict["department_name"] = perm.file.department.name if perm.file and perm.file.department else None
        item_dict["is_public"] = perm.file.is_public if perm.file else None
        item_dict["granter_name"] = perm.granter.full_name if perm.granter else None
        items.append(FilePermissionDetail(**item_dict))
    
    return FilePermissionListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=ceil(total / limit) if total > 0 else 0
    )


@router.delete("/permissions/{permission_id}")
async def revoke_file_permission(
    permission_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_super_admin)
):
    """
    撤銷文件訪問權限
    
    需要管理員權限
    """
    result = await db.execute(
        select(FilePermission).where(FilePermission.id == permission_id)
    )
    permission = result.scalar_one_or_none()
    
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="權限記錄不存在"
        )
    
    await db.delete(permission)
    await db.commit()
    
    return {
        "success": True,
        "message": "權限已撤銷"
    }
