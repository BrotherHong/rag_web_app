"""活動記錄 API 路由"""

import math
from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.activity import Activity, ActivityType
from app.models.file import File
from app.schemas.activity import (
    ActivityListResponse,
    ActivityListItem,
    ActivityDetail,
    ActivityStatsResponse
)

router = APIRouter(prefix="/activities", tags=["活動記錄"])


@router.get("", response_model=ActivityListResponse)
async def get_activities(
    page: int = Query(1, ge=1, description="頁碼"),
    limit: int = Query(20, ge=1, le=100, description="每頁數量"),
    activity_type: Optional[str] = Query(None, description="活動類型篩選"),
    user_id: Optional[int] = Query(None, description="使用者ID篩選"),
    file_id: Optional[int] = Query(None, description="檔案ID篩選"),
    search: Optional[str] = Query(None, description="搜尋描述"),
    start_date: Optional[datetime] = Query(None, description="開始日期"),
    end_date: Optional[datetime] = Query(None, description="結束日期"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得活動記錄列表（當前處室）
    
    - 支援分頁
    - 支援多種篩選條件
    - 自動過濾處室（一般使用者只能看自己處室的活動）
    - 超級管理員可以看所有活動
    """
    
    # 建立基礎查詢
    query = select(Activity).options(
        joinedload(Activity.user),
        joinedload(Activity.file),
        joinedload(Activity.department)
    )
    
    # 處室隔離：
    # 1. 非系統管理員只能看自己處室的活動
    # 2. 系統管理員在代理模式下（有 department_id）也只能看代理處室的活動
    from app.models.user import UserRole
    if current_user.role != UserRole.SUPER_ADMIN or current_user.department_id is not None:
        # 使用 Activity.department_id 過濾
        query = query.where(
            Activity.department_id == current_user.department_id
        )
    
    # 活動類型篩選
    if activity_type:
        try:
            type_enum = ActivityType(activity_type)
            query = query.where(Activity.activity_type == type_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail="無效的活動類型")
    
    # 使用者篩選
    if user_id:
        query = query.where(Activity.user_id == user_id)
    
    # 檔案篩選
    if file_id:
        query = query.where(Activity.file_id == file_id)
    
    # 描述搜尋
    if search:
        query = query.where(Activity.description.ilike(f"%{search}%"))
    
    # 日期範圍篩選
    if start_date:
        query = query.where(Activity.created_at >= start_date)
    if end_date:
        query = query.where(Activity.created_at <= end_date)
    
    # 計算總數
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    # 排序和分頁
    query = query.order_by(desc(Activity.created_at))
    query = query.offset((page - 1) * limit).limit(limit)
    
    # 執行查詢
    result = await db.execute(query)
    activities = result.scalars().all()
    
    # 轉換為回應格式
    items = []
    for activity in activities:
        items.append(ActivityListItem(
            id=activity.id,
            activity_type=activity.activity_type.value,
            description=activity.description,
            user_id=activity.user_id,
            username=activity.user.username if activity.user else "未知",
            user_full_name=activity.user.full_name if activity.user else "未知",
            file_id=activity.file_id,
            file_name=activity.file.original_filename if activity.file else None,
            ip_address=activity.ip_address,
            created_at=activity.created_at,
            department_id=activity.department_id,
            department_name=activity.department.name if activity.department else None
        ))
    
    return ActivityListResponse(
        items=items,
        total=total or 0,
        page=page,
        pages=math.ceil(total / limit) if total and total > 0 else 0
    )


@router.get("/all", response_model=ActivityListResponse)
async def get_all_activities(
    page: int = Query(1, ge=1, description="頁碼"),
    limit: int = Query(50, ge=1, le=100, description="每頁數量"),
    departmentId: Optional[int] = Query(None, description="處室ID篩選"),
    activity_type: Optional[str] = Query(None, description="活動類型篩選"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得所有處室的活動記錄（僅管理員）
    
    前端期望此端點用於超級管理員查看所有處室活動
    - 需要管理員權限
    - 可選擇性篩選特定處室
    - 支援分頁
    """
    from app.models.user import UserRole
    
    # 權限檢查：只有非代理模式的系統管理員可以使用此端點
    if current_user.role != UserRole.SUPER_ADMIN or current_user.department_id is not None:
        raise HTTPException(
            status_code=403,
            detail="需要系統管理員權限，且不能在代理模式下使用"
        )
    
    # 建立基礎查詢
    query = select(Activity).options(
        joinedload(Activity.user),
        joinedload(Activity.file),
        joinedload(Activity.department)
    )
    
    # 處室篩選（如果提供）
    if departmentId is not None:
        query = query.where(
            Activity.department_id == departmentId
        )
    
    # 活動類型篩選
    if activity_type:
        try:
            type_enum = ActivityType(activity_type)
            query = query.where(Activity.activity_type == type_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail="無效的活動類型")
    
    # 計算總數
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    # 排序和分頁
    query = query.order_by(desc(Activity.created_at))
    query = query.offset((page - 1) * limit).limit(limit)
    
    # 執行查詢
    result = await db.execute(query)
    activities = result.scalars().all()
    
    # 轉換為回應格式
    items = []
    for activity in activities:
        items.append(ActivityListItem(
            id=activity.id,
            activity_type=activity.activity_type.value,
            description=activity.description,
            user_id=activity.user_id,
            username=activity.user.username if activity.user else "未知",
            user_full_name=activity.user.full_name if activity.user else "未知",
            file_id=activity.file_id,
            file_name=activity.file.original_filename if activity.file else None,
            ip_address=activity.ip_address,
            created_at=activity.created_at,
            department_id=activity.department_id,
            department_name=activity.department.name if activity.department else None
        ))
    
    return ActivityListResponse(
        items=items,
        total=total or 0,
        page=page,
        pages=math.ceil(total / limit) if total and total > 0 else 0
    )

