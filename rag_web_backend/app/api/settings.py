"""系統設定 API 路由"""

import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models import ActivityType, SystemSetting, User, UserRole
from app.schemas.system_setting import (
    SystemSettingBatchUpdate,
    SystemSettingListResponse,
    SystemSettingResponse,
)
from app.schemas import MessageResponse
from app.services.activity import activity_service

router = APIRouter(prefix="/settings", tags=["系統設定"])


@router.get("/", response_model=SystemSettingListResponse, summary="取得設定列表")
async def list_settings(
    page: int = Query(1, ge=1, description="頁碼"),
    limit: int = Query(20, ge=1, le=100, description="每頁數量"),
    category: Optional[str] = Query(None, description="設定類型篩選"),
    search: Optional[str] = Query(None, description="搜尋關鍵字"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    取得系統設定列表（分頁）
    
    需要認證，一般使用者只能看公開設定，管理員可看所有設定
    
    - **page**: 頁碼
    - **limit**: 每頁數量
    - **category**: 設定類型
    - **search**: 搜尋 key, display_name, description
    """
    # 基礎查詢
    query = select(SystemSetting)
    
    # 權限過濾：一般使用者只能看公開設定
    if current_user.role not in [UserRole.SUPER_ADMIN]:
        query = query.where(SystemSetting.is_public == True)
    
    # 類型過濾
    if category:
        query = query.where(SystemSetting.category == category)
    
    # 搜尋過濾
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (SystemSetting.key.ilike(search_pattern)) |
            (SystemSetting.display_name.ilike(search_pattern)) |
            (SystemSetting.description.ilike(search_pattern))
        )
    
    # 計算總數
    total_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(total_query) or 0
    
    # 分頁
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    
    # 執行查詢
    result = await db.execute(query)
    settings = result.scalars().all()
    
    # 計算總頁數
    pages = math.ceil(total / limit) if total > 0 else 1
    
    return SystemSettingListResponse(
        items=settings,
        total=total,
        page=page,
        pages=pages
    )


@router.post(
    "/batch",
    response_model=MessageResponse,
    summary="批次更新設定",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))]
)
async def batch_update_settings(
    batch_data: SystemSettingBatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    批次更新多個系統設定
    
    需要系統管理員權限
    
    - **settings**: 設定字典，key 為設定鍵，value 為設定值
    
    只更新已存在的設定，不存在的會被忽略
    """
    updated_count = 0
    
    for key, value in batch_data.settings.items():
        result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        setting = result.scalar_one_or_none()
        
        if setting:
            setting.value = value
            updated_count += 1
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type=ActivityType.UPDATE_SETTING,
        description=f"批次更新 {updated_count} 個系統設定",
        department_id=current_user.department_id
    )
    
    await db.commit()
    
    return MessageResponse(
        message="批次更新成功",
        detail=f"已更新 {updated_count} 個設定"
    )
