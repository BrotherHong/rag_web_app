"""後台查詢用戶管理 API 路由

供後台管理員使用，用於審批註冊申請、管理查詢用戶、分配文件權限等
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from math import ceil

from app.core.database import get_db
from app.core.security import get_current_active_admin, get_password_hash
from app.models.user import User
from app.models.query_user import QueryUser, QueryUserStatus
from app.models.user_group import query_user_groups
from app.schemas.query_user import (
    QueryUserDetail,
    QueryUserListResponse,
    QueryUserCreateRequest,
    QueryUserUpdateRequest,
    QueryUserStats
)

router = APIRouter(prefix="/query-users", tags=["查詢用戶管理"])


@router.get("/stats", response_model=QueryUserStats)
async def get_query_user_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
):
    """
    獲取查詢用戶統計資訊
    
    需要管理員權限
    自動根據當前管理員的處室過濾
    """
    # 基礎查詢條件
    base_conditions = []
    if current_user.department_id:
        base_conditions.append(QueryUser.default_department_id == current_user.department_id)
    
    # 總數
    total_query = select(func.count(QueryUser.id))
    if base_conditions:
        total_query = total_query.where(and_(*base_conditions))
    total_result = await db.execute(total_query)
    total = total_result.scalar()
    
    # 各狀態數量
    pending_query = select(func.count(QueryUser.id)).where(QueryUser.status == QueryUserStatus.PENDING)
    if base_conditions:
        pending_query = pending_query.where(and_(*base_conditions))
    pending_result = await db.execute(pending_query)
    pending = pending_result.scalar()
    
    approved_query = select(func.count(QueryUser.id)).where(QueryUser.status == QueryUserStatus.APPROVED)
    if base_conditions:
        approved_query = approved_query.where(and_(*base_conditions))
    approved_result = await db.execute(approved_query)
    approved = approved_result.scalar()
    
    rejected_query = select(func.count(QueryUser.id)).where(QueryUser.status == QueryUserStatus.REJECTED)
    if base_conditions:
        rejected_query = rejected_query.where(and_(*base_conditions))
    rejected_result = await db.execute(rejected_query)
    rejected = rejected_result.scalar()
    
    suspended_query = select(func.count(QueryUser.id)).where(QueryUser.status == QueryUserStatus.SUSPENDED)
    if base_conditions:
        suspended_query = suspended_query.where(and_(*base_conditions))
    suspended_result = await db.execute(suspended_query)
    suspended = suspended_result.scalar()
    
    # 啟用/停用數量
    active_query = select(func.count(QueryUser.id)).where(QueryUser.is_active == True)
    if base_conditions:
        active_query = active_query.where(and_(*base_conditions))
    active_result = await db.execute(active_query)
    active = active_result.scalar()
    
    inactive_query = select(func.count(QueryUser.id)).where(QueryUser.is_active == False)
    if base_conditions:
        inactive_query = inactive_query.where(and_(*base_conditions))
    inactive_result = await db.execute(inactive_query)
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
    current_user: User = Depends(get_current_active_admin)
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
    await db.refresh(query_user)
    
    # 處理用戶身分組
    if user_data.user_group_ids:
        for group_id in user_data.user_group_ids:
            await db.execute(
                query_user_groups.insert().values(
                    query_user_id=query_user.id,
                    user_group_id=group_id
                )
            )
        await db.commit()
    
    # 重新查詢以預加載關聯
    result = await db.execute(
        select(QueryUser)
        .options(
            selectinload(QueryUser.approver),
            selectinload(QueryUser.default_department),
            selectinload(QueryUser.user_groups)
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
    current_user: User = Depends(get_current_active_admin)
):
    """
    獲取查詢用戶列表（分頁）
    
    需要管理員權限
    自動根據當前管理員的處室過濾查詢用戶
    """
    # 構建查詢
    query = select(QueryUser).options(
        selectinload(QueryUser.approver),
        selectinload(QueryUser.default_department),
        selectinload(QueryUser.user_groups)
    )
    
    # 根據當前管理員的處室過濾（只顯示該處室的查詢用戶）
    if current_user.department_id:
        query = query.where(QueryUser.default_department_id == current_user.department_id)
    
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
    current_user: User = Depends(get_current_active_admin)
):
    """
    獲取查詢用戶詳細資訊
    
    需要管理員權限
    """
    result = await db.execute(
        select(QueryUser)
        .options(
            selectinload(QueryUser.approver),
            selectinload(QueryUser.default_department),
            selectinload(QueryUser.user_groups)
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


@router.patch("/{user_id}")
async def update_query_user(
    user_id: int,
    request: QueryUserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
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
    
    # 更新用戶身分組
    if request.user_group_ids is not None:
        # 清除現有的身分組關聯
        await db.execute(
            delete(query_user_groups).where(query_user_groups.c.query_user_id == user_id)
        )
        
        # 添加新的身分組關聯
        if request.user_group_ids:
            for group_id in request.user_group_ids:
                await db.execute(
                    query_user_groups.insert().values(
                        query_user_id=user_id,
                        user_group_id=group_id
                    )
                )
    
    await db.commit()
    
    # 重新查詢以預加載關聯
    result = await db.execute(
        select(QueryUser)
        .options(
            selectinload(QueryUser.approver),
            selectinload(QueryUser.default_department),
            selectinload(QueryUser.user_groups)
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
    current_user: User = Depends(get_current_active_admin)
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
    current_user: User = Depends(get_current_active_admin)
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
    current_user: User = Depends(get_current_active_admin)
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
