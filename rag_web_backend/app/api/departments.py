"""處室管理 API 路由"""

import math
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models import Activity, ActivityType, Category, Department, File, User, UserRole
from app.schemas import (
    DepartmentCreate,
    DepartmentListResponse,
    DepartmentResponse,
    DepartmentStatsResponse,
    DepartmentUpdate,
    MessageResponse,
)
from app.services.activity import activity_service

router = APIRouter(prefix="/departments", tags=["處室管理"])


@router.get("/", response_model=DepartmentListResponse, summary="取得處室列表")
async def list_departments(
    page: int = Query(1, ge=1, description="頁碼"),
    limit: int = Query(20, ge=1, le=100, description="每頁數量"),
    search: Optional[str] = Query(None, description="搜尋處室名稱或描述"),
    db: AsyncSession = Depends(get_db)
):
    """
    取得所有處室列表（分頁）
    
    - **page**: 頁碼（從 1 開始）
    - **limit**: 每頁數量（1-100）
    - **search**: 搜尋關鍵字（名稱或描述）
    
    公開端點，不需要認證
    """
    # 基礎查詢
    query = select(Department)
    
    # 搜尋過濾
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (Department.name.ilike(search_pattern)) |
            (Department.description.ilike(search_pattern))
        )
    
    # 計算總數
    total_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(total_query) or 0
    
    # 分頁
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    
    # 執行查詢
    result = await db.execute(query)
    departments = result.scalars().all()
    
    # 為每個處室添加統計資訊
    dept_list = []
    for dept in departments:
        # 計算使用者數量
        user_count = await db.scalar(
            select(func.count()).where(User.department_id == dept.id)
        ) or 0
        
        # 計算檔案數量
        file_count = await db.scalar(
            select(func.count()).where(File.department_id == dept.id)
        ) or 0
        
        # 創建響應物件
        dept_dict = {
            "id": dept.id,
            "name": dept.name,
            "slug": dept.slug,
            "description": dept.description,
            "color": dept.color,
            "user_count": user_count,
            "file_count": file_count,
            "created_at": dept.created_at,
            "updated_at": dept.updated_at
        }
        dept_list.append(dept_dict)
    
    # 計算總頁數
    pages = math.ceil(total / limit) if total > 0 else 1
    
    return DepartmentListResponse(
        items=dept_list,
        total=total,
        page=page,
        pages=pages
    )


@router.get("/{department_id}", response_model=DepartmentResponse, summary="取得處室詳情")
async def get_department(
    department_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    取得特定處室的詳細資訊
    
    - **department_id**: 處室 ID
    """
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()
    
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="處室不存在"
        )
    
    return department


@router.get("/by-slug/{slug}", response_model=DepartmentResponse, summary="透過 slug 取得處室詳情")
async def get_department_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db)
):
    """
    根據 slug 取得處室詳細資訊

    - **slug**: 處室的 URL 友善識別碼
    """
    result = await db.execute(select(Department).where(Department.slug == slug))
    department = result.scalar_one_or_none()

    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="處室不存在"
        )

    # 計算使用者數量
    user_count = await db.scalar(
        select(func.count()).where(User.department_id == department.id)
    ) or 0
    
    # 計算檔案數量
    file_count = await db.scalar(
        select(func.count()).where(File.department_id == department.id)
    ) or 0
    
    # 返回完整資訊
    return {
        "id": department.id,
        "name": department.name,
        "slug": department.slug,
        "description": department.description,
        "color": department.color,
        "user_count": user_count,
        "file_count": file_count,
        "created_at": department.created_at,
        "updated_at": department.updated_at
    }


@router.post(
    "/",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="建立處室",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))]
)
async def create_department(
    department_data: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    建立新處室
    
    需要系統管理員權限
    
    - **name**: 處室名稱（唯一）
    - **slug**: URL 識別碼（唯一，例: hr, acc, it）
    - **description**: 處室描述（可選）
    - **color**: 主題顏色（選填，預設藍色）
    """
    # 檢查名稱是否已存在
    result = await db.execute(select(Department).where(Department.name == department_data.name))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="處室名稱已存在"
        )
    
    # 檢查 slug 是否已存在
    result = await db.execute(select(Department).where(Department.slug == department_data.slug))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"URL 識別碼 '{department_data.slug}' 已被使用"
        )
    
    # 建立處室
    department = Department(**department_data.model_dump())
    db.add(department)
    await db.flush()  # 先 flush 以取得 department.id
    
    # 自動建立"其他"分類
    default_category = Category(
        name="其他",
        description="不屬於以上任一分類的檔案",
        color="#6B7280",  # 灰色
        department_id=department.id
    )
    db.add(default_category)
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="CREATE_DEPARTMENT",
        description=f"建立處室: {department.name}",
        department_id=department.id
    )
    
    await db.commit()
    await db.refresh(department)
    
    return department


@router.put(
    "/{department_id}",
    response_model=DepartmentResponse,
    summary="更新處室",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))]
)
async def update_department(
    department_id: int,
    department_data: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    更新處室資訊
    
    需要系統管理員權限
    
    - **department_id**: 處室 ID
    - **name**: 新處室名稱（可選）
    - **description**: 新處室描述（可選）
    """
    # 查詢處室
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()
    
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="處室不存在"
        )
    
    # 檢查名稱是否與其他處室重複
    if department_data.name and department_data.name != department.name:
        result = await db.execute(
            select(Department).where(
                Department.name == department_data.name,
                Department.id != department_id
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="處室名稱已被使用"
            )
    
    # 更新欄位
    update_data = department_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(department, field, value)
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type=ActivityType.UPDATE_DEPARTMENT,
        description=f"更新處室: {department.name}",
        department_id=department.id
    )
    
    await db.commit()
    await db.refresh(department)
    
    return department


@router.delete(
    "/{department_id}",
    response_model=MessageResponse,
    summary="刪除處室",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))]
)
async def delete_department(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    刪除處室
    
    需要系統管理員權限
    
    - **department_id**: 處室 ID
    
    注意：刪除處室會同時刪除該處室下的所有使用者和檔案
    """
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()
    
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="處室不存在"
        )
    
    # 檢查是否有使用者
    user_count_result = await db.execute(
        select(func.count()).where(User.department_id == department_id)
    )
    user_count = user_count_result.scalar() or 0
    
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"無法刪除處室，該處室仍存在 {user_count} 位使用者"
        )
    
    # 記錄處室名稱（刪除前）
    department_name = department.name
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type=ActivityType.DELETE_DEPARTMENT,
        description=f"刪除處室: {department_name}",
        department_id=department.id
    )
    
    await db.delete(department)
    await db.commit()
    
    return MessageResponse(
        message="處室刪除成功",
        detail=f"已刪除處室: {department_name}"
    )


@router.get("/{department_id}/stats", response_model=DepartmentStatsResponse, summary="取得處室統計")
async def get_department_stats(
    department_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    取得特定處室的統計資訊
    
    - **department_id**: 處室 ID
    
    返回：
    - 使用者數量（總數、啟用數）
    - 檔案數量、總大小
    - 活動記錄數量
    - 最近活動（最新 10 筆）
    """
    # 檢查處室是否存在
    result = await db.execute(select(Department).where(Department.id == department_id))
    department = result.scalar_one_or_none()
    
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="處室不存在"
        )
    
    # 1. 使用者統計
    user_count_query = select(func.count()).where(User.department_id == department_id)
    user_count = await db.scalar(user_count_query) or 0
    
    active_user_count_query = select(func.count()).where(
        User.department_id == department_id,
        User.is_active == True
    )
    active_user_count = await db.scalar(active_user_count_query) or 0
    
    # 2. 檔案統計
    file_count_query = select(func.count()).where(File.department_id == department_id)
    file_count = await db.scalar(file_count_query) or 0
    
    file_size_query = select(func.sum(File.file_size)).where(File.department_id == department_id)
    total_file_size = await db.scalar(file_size_query) or 0
    
    # 3. 活動記錄統計(使用 Activity.department_id 過濾)
    activity_count_query = select(func.count()).where(
        Activity.department_id == department_id
    )
    activity_count = await db.scalar(activity_count_query) or 0
    
    # 4. 最近活動(最新 10 筆，使用 Activity.department_id 過濾)
    recent_activities_query = select(
        Activity.id,
        Activity.activity_type,
        Activity.description,
        Activity.created_at,
        User.username
    ).join(User, Activity.user_id == User.id).where(
        Activity.department_id == department_id
    ).order_by(desc(Activity.created_at)).limit(10)
    
    result = await db.execute(recent_activities_query)
    recent_activities = [
        {
            "id": row[0],
            "activity_type": row[1].value,
            "description": row[2],
            "created_at": row[3].isoformat(),
            "username": row[4]
        }
        for row in result.all()
    ]
    
    return DepartmentStatsResponse(
        department_id=department.id,
        department_name=department.name,
        user_count=user_count,
        active_user_count=active_user_count,
        file_count=file_count,
        total_file_size=total_file_size,
        activity_count=activity_count,
        recent_activities=recent_activities
    )

