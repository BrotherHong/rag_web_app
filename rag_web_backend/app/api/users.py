"""使用者管理 API 路由"""

import math
from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, get_password_hash, verify_password, require_role
from app.models import User, UserRole, Department, Activity, ActivityType
from app.schemas import (
    UserCreate,
    UserUpdate,
    PasswordChange,
    UserResponse,
    UserListResponse,
    UserStatsResponse,
    MessageResponse,
)
from app.services.activity import activity_service

router = APIRouter(prefix="/users", tags=["使用者管理"])


@router.post(
    "/",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="建立使用者",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))]
)
async def create_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    建立新使用者
    
    需要系統管理員權限
    
    - **username**: 使用者名稱（唯一）
    - **email**: 電子郵件（唯一）
    - **password**: 密碼
    - **full_name**: 全名
    - **department_id**: 所屬處室 ID
    """
    # 檢查使用者名稱是否已存在
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="使用者名稱已存在"
        )
    
    # 檢查 Email 是否已存在
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email 已被使用"
        )
    
    # 檢查處室是否存在
    result = await db.execute(select(Department).where(Department.id == user_data.department_id))
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="處室不存在"
        )
    
    # 系統管理員在代理模式下只能建立代理處室的使用者
    # 系統管理員非代理模式可以建立任何處室的使用者
    if current_user.department_id is not None:
        # 系統管理員代理模式：只能建立代理處室
        if user_data.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="代理模式下只能建立代理處室的使用者"
            )
    # 系統管理員非代理模式：無限制，可建立任何處室的使用者
    
    # 建立使用者
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=get_password_hash(user_data.password),
        role=UserRole.ADMIN,  # 系統管理員建立的使用者預設為處室管理員
        department_id=user_data.department_id,
        is_active=True
    )
    
    db.add(new_user)
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type=ActivityType.CREATE_USER,
        description=f"建立使用者: {new_user.username}",
        department_id=current_user.department_id
    )
    
    await db.commit()
    await db.refresh(new_user)
    
    return new_user


@router.get("/", response_model=UserListResponse, summary="取得使用者列表")
async def list_users(
    page: int = Query(1, ge=1, description="頁碼"),
    limit: int = Query(20, ge=1, le=100, description="每頁筆數"),
    department_id: Optional[int] = Query(None, description="篩選處室 ID"),
    is_active: Optional[bool] = Query(None, description="篩選是否啟用"),
    role: Optional[str] = Query(None, description="篩選角色"),
    search: Optional[str] = Query(None, description="搜尋使用者名稱或全名"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    取得使用者列表（分頁）
    
    - **page**: 頁碼
    - **limit**: 每頁筆數
    - **department_id**: 篩選特定處室
    - **is_active**: 篩選是否啟用
    - **role**: 篩選角色
    - **search**: 搜尋使用者名稱或全名
    
    處室管理員只能查看自己處室的使用者
    """
    query = select(User)
    
    # 處室管理員只能查詢自己處室的使用者
    # 系統管理員在代理模式下（有 department_id）也只能查詢代理處室的使用者
    # 系統管理員非代理模式可以查詢所有使用者
    if current_user.role == UserRole.ADMIN:
        # 處室管理員：只能看自己處室
        query = query.where(User.department_id == current_user.department_id)
    elif current_user.role == UserRole.SUPER_ADMIN and current_user.department_id is not None:
        # 系統管理員代理模式：只能看代理處室
        query = query.where(User.department_id == current_user.department_id)
    elif department_id and current_user.role == UserRole.SUPER_ADMIN:
        # 系統管理員非代理模式：可以按 department_id 篩選
        query = query.where(User.department_id == department_id)
    
    # 篩選是否啟用
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    
    # 篩選角色
    if role:
        try:
            role_enum = UserRole(role)
            query = query.where(User.role == role_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail="無效的角色")
    
    # 搜尋
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (User.username.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern)) |
            (User.email.ilike(search_pattern))
        )
    
    # 計算總數
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0
    
    # 分頁
    query = query.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    return UserListResponse(
        items=[UserResponse.model_validate(user) for user in users],
        total=total,
        page=page,
        page_size=limit,
        pages=math.ceil(total / limit) if total > 0 else 0
    )


@router.get("/{user_id}", response_model=UserResponse, summary="取得使用者詳情")
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    取得特定使用者的詳細資訊
    
    - **user_id**: 使用者 ID
    
    處室管理員只能查看自己處室的使用者
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="使用者不存在"
        )
    
    # 處室管理員只能查看自己處室的使用者
    # 系統管理員在代理模式下也只能查看代理處室的使用者
    # 系統管理員非代理模式可以查看所有使用者
    if current_user.role == UserRole.ADMIN:
        # 處室管理員：只能看自己處室
        if user.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權限查看此使用者"
            )
    elif current_user.role == UserRole.SUPER_ADMIN and current_user.department_id is not None:
        # 系統管理員代理模式：只能看代理處室
        if user.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權限查看此使用者"
            )
    # 系統管理員非代理模式：無限制，可查看所有使用者
    
    return user


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="更新使用者資訊",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))]
)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    更新使用者資訊
    
    需要系統管理員權限
    
    - **user_id**: 使用者 ID
    - **email**: 新的 Email（可選）
    - **full_name**: 新的全名（可選）
    - **department_id**: 新的處室 ID（可選）
    - **is_active**: 是否啟用（可選）
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="使用者不存在"
        )
    
    # 系統管理員在代理模式下只能更新代理處室的使用者
    # 系統管理員非代理模式可以更新所有使用者
    if current_user.department_id is not None:
        # 系統管理員代理模式：只能更新代理處室
        if user.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權限更新此使用者"
            )
    # 系統管理員非代理模式：無限制，可更新所有使用者
    
    # 更新欄位
    update_data = user_data.model_dump(exclude_unset=True)
    
    # 處理密碼更新
    if "password" in update_data and update_data["password"]:
        update_data["hashed_password"] = get_password_hash(update_data.pop("password"))
    
    # 檢查 Email 是否重複
    if "email" in update_data:
        result = await db.execute(
            select(User).where(User.email == update_data["email"], User.id != user_id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email 已被使用"
            )
    
    # 檢查處室是否存在
    if "department_id" in update_data:
        result = await db.execute(select(Department).where(Department.id == update_data["department_id"]))
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="處室不存在"
            )
    
    for field, value in update_data.items():
        setattr(user, field, value)
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type=ActivityType.UPDATE_USER,
        description=f"更新使用者: {user.username}",
        department_id=current_user.department_id
    )
    
    await db.commit()
    await db.refresh(user)
    
    return user


@router.delete(
    "/{user_id}",
    response_model=MessageResponse,
    summary="刪除使用者",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))]
)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    刪除使用者
    
    需要系統管理員權限
    
    - **user_id**: 使用者 ID
    
    注意：不能刪除自己
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能刪除自己"
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="使用者不存在"
        )
    
    username = user.username
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type=ActivityType.DELETE_USER,
        description=f"刪除使用者: {username}",
        department_id=current_user.department_id
    )
    
    await db.delete(user)
    await db.commit()
    await db.commit()
    
    return MessageResponse(
        message="使用者刪除成功",
        detail=f"已刪除使用者: {username}"
    )


@router.put("/{user_id}/password", response_model=MessageResponse, summary="修改使用者密碼")
async def change_password(
    user_id: int,
    password_data: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    修改使用者密碼
    
    - 使用者只能修改自己的密碼
    - 管理員可以不提供舊密碼直接重置密碼
    
    - **user_id**: 使用者 ID
    - **old_password**: 舊密碼（管理員可省略）
    - **new_password**: 新密碼
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="使用者不存在"
        )
    
    # 權限檢查
    is_self = user_id == current_user.id
    is_super_admin = current_user.role == UserRole.SUPER_ADMIN
    is_dept_admin = current_user.role == UserRole.ADMIN and user.department_id == current_user.department_id
    
    if not (is_self or is_super_admin or is_dept_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="無權限修改此使用者密碼"
        )
    
    # 如果是修改自己的密碼，需要驗證舊密碼
    if is_self and not is_super_admin:
        if not verify_password(password_data.old_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="舊密碼錯誤"
            )
    
    # 更新密碼
    user.hashed_password = get_password_hash(password_data.new_password)
    
    # 記錄活動
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type=ActivityType.UPDATE_PROFILE,
        description=f"修改使用者密碼: {user.username}",
        department_id=current_user.department_id
    )
    
    await db.commit()
    
    return {"message": "密碼修改成功"}
    
    return MessageResponse(
        message="密碼修改成功",
        detail="請使用新密碼登入"
    )


@router.get("/stats/summary", response_model=UserStatsResponse, summary="取得使用者統計")
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    取得使用者統計資訊
    
    - 總使用者數、啟用/停用數
    - 依角色統計
    - 依處室統計
    - 最近登入記錄
    
    處室管理員只能看自己處室的統計
    """
    # 基礎查詢（處室隔離）
    # 處室管理員只能看自己處室的統計
    # 系統管理員在代理模式下也只能看代理處室的統計
    # 系統管理員非代理模式可以看所有統計
    base_query = select(User)
    if current_user.role == UserRole.ADMIN:
        # 處室管理員：只能看自己處室
        base_query = base_query.where(User.department_id == current_user.department_id)
    elif current_user.role == UserRole.SUPER_ADMIN and current_user.department_id is not None:
        # 系統管理員代理模式：只能看代理處室
        base_query = base_query.where(User.department_id == current_user.department_id)
    # 系統管理員非代理模式：無限制，可看所有統計
    
    # 1. 總使用者數
    total_query = select(func.count()).select_from(base_query.subquery())
    total_users = await db.scalar(total_query) or 0
    
    # 2. 啟用使用者數
    active_query = select(func.count()).select_from(
        base_query.where(User.is_active == True).subquery()
    )
    active_users = await db.scalar(active_query) or 0
    
    # 3. 停用使用者數
    inactive_users = total_users - active_users
    
    # 4. 依角色統計
    role_query = select(
        User.role,
        func.count(User.id).label('count')
    ).select_from(base_query.subquery()).group_by(User.role)
    
    role_result = await db.execute(role_query)
    by_role = {row[0].value: row[1] for row in role_result.all()}
    
    # 5. 依處室統計
    dept_query = select(
        Department.id,
        Department.name,
        func.count(User.id).label('user_count')
    ).select_from(
        base_query.subquery()
    ).join(Department, User.department_id == Department.id).group_by(
        Department.id, Department.name
    ).order_by(desc('user_count'))
    
    dept_result = await db.execute(dept_query)
    by_department = [
        {
            "department_id": row[0],
            "department_name": row[1],
            "user_count": row[2]
        }
        for row in dept_result.all()
    ]
    
    # 6. 最近登入記錄（從 Activity 表查詢）
    login_query = select(
        Activity.user_id,
        User.username,
        User.full_name,
        func.max(Activity.created_at).label('last_login')
    ).join(User, Activity.user_id == User.id).where(
        Activity.activity_type == ActivityType.LOGIN
    )
    
    if current_user.role == UserRole.ADMIN:
        # 處室管理員：只能看自己處室
        login_query = login_query.where(User.department_id == current_user.department_id)
    elif current_user.role == UserRole.SUPER_ADMIN and current_user.department_id is not None:
        # 系統管理員代理模式：只能看代理處室
        login_query = login_query.where(User.department_id == current_user.department_id)
    # 系統管理員非代理模式：無限制，可看所有登入記錄
    
    login_query = login_query.group_by(
        Activity.user_id, User.username, User.full_name
    ).order_by(desc('last_login')).limit(10)
    
    login_result = await db.execute(login_query)
    recent_logins = [
        {
            "user_id": row[0],
            "username": row[1],
            "full_name": row[2],
            "last_login": row[3].isoformat() if row[3] else None
        }
        for row in login_result.all()
    ]
    
    return UserStatsResponse(
        total_users=total_users,
        active_users=active_users,
        inactive_users=inactive_users,
        users_by_role=by_role,
        users_by_department=by_department,
        recent_logins=recent_logins,
        updated_at=datetime.now()
    )

