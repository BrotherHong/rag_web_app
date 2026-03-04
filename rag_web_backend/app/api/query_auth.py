"""查詢用戶認證 API 路由

專門用於前端查詢系統的用戶註冊、登入等功能
與後台管理員系統完全獨立
"""

from datetime import datetime, timedelta
import secrets
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    get_password_hash,
    verify_password,
    authenticate_query_user,
    create_query_user_token,
    get_current_query_user
)
from app.models.query_user import QueryUser, QueryUserStatus
from app.models.user_group import UserGroup
from app.schemas.query_user import (
    QueryUserRegisterRequest,
    QueryUserRegisterResponse,
    QueryUserLoginRequest,
    QueryUserLoginResponse,
    QueryUserInfo,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    ChangePasswordRequest,
)

router = APIRouter(prefix="/query-auth", tags=["查詢用戶認證"])


@router.post("/register", response_model=QueryUserRegisterResponse)
async def register_query_user(
    request: QueryUserRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    查詢用戶註冊
    
    註冊後即可直接登入使用
    """
    # 檢查 username 是否已存在
    result = await db.execute(
        select(QueryUser).where(QueryUser.username == request.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="使用者名稱已被使用"
        )
    
    # 檢查 email 是否已存在
    result = await db.execute(
        select(QueryUser).where(QueryUser.email == request.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="電子郵件已被使用"
        )
    
    # 創建查詢用戶（直接為已批准狀態）
    query_user = QueryUser(
        username=request.username,
        email=request.email,
        hashed_password=get_password_hash(request.password),
        full_name=request.full_name,
        organization=request.organization,
        application_reason=request.application_reason,
        default_department_id=request.default_department_id,
        status=QueryUserStatus.APPROVED,
        is_active=True
    )
    
    db.add(query_user)
    await db.commit()
    await db.refresh(query_user)
    
    # 自動加入所屬處室的「一般登入」身分組
    if query_user.default_department_id:
        group_result = await db.execute(
            select(UserGroup).where(
                UserGroup.department_id == query_user.default_department_id,
                UserGroup.name == "一般登入"
            )
        )
        general_group = group_result.scalar_one_or_none()
        if general_group:
            from sqlalchemy.orm import selectinload
            user_result = await db.execute(
                select(QueryUser)
                .where(QueryUser.id == query_user.id)
                .options(selectinload(QueryUser.user_groups))
            )
            query_user = user_result.scalar_one()
            query_user.user_groups.append(general_group)
            await db.commit()
    
    return QueryUserRegisterResponse(
        id=query_user.id,
        username=query_user.username,
        email=query_user.email,
        status=query_user.status if isinstance(query_user.status, str) else query_user.status.value,
        message="註冊成功，請使用您的帳號登入。"
    )


@router.post("/login", response_model=QueryUserLoginResponse)
async def login_query_user(
    request: QueryUserLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    查詢用戶登入
    
    使用 username 或 email 都可以登入
    """
    # 驗證用戶
    query_user = await authenticate_query_user(db, request.username, request.password)
    
    if not query_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="使用者名稱或密碼錯誤",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 檢查帳號狀態
    if query_user.status == QueryUserStatus.REJECTED:
        rejection_msg = f"您的申請已被拒絕"
        if query_user.rejection_reason:
            rejection_msg += f"：{query_user.rejection_reason}"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=rejection_msg
        )
    elif query_user.status == QueryUserStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您的帳號已被停用，請聯繫管理員"
        )
    
    # 檢查帳號是否啟用
    if not query_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您的帳號已被停用"
        )
    
    # 生成 token
    access_token = create_query_user_token(query_user.id)
    
    return QueryUserLoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=QueryUserInfo.model_validate(query_user)
    )


@router.get("/me", response_model=QueryUserInfo)
async def get_current_query_user_info(
    current_user: QueryUser = Depends(get_current_query_user),
    db: AsyncSession = Depends(get_db)
):
    """
    獲取當前查詢用戶資訊
    
    需要登入
    """
    return QueryUserInfo.model_validate(current_user)


@router.get("/check-username/{username}")
async def check_username_available(
    username: str,
    db: AsyncSession = Depends(get_db)
):
    """
    檢查使用者名稱是否可用
    
    用於註冊表單的即時驗證
    """
    result = await db.execute(
        select(QueryUser).where(QueryUser.username == username)
    )
    exists = result.scalar_one_or_none() is not None
    
    return {
        "available": not exists,
        "message": "使用者名稱已被使用" if exists else "使用者名稱可用"
    }


@router.get("/check-email/{email}")
async def check_email_available(
    email: str,
    db: AsyncSession = Depends(get_db)
):
    """
    檢查電子郵件是否可用
    
    用於註冊表單的即時驗證
    """
    result = await db.execute(
        select(QueryUser).where(QueryUser.email == email)
    )
    exists = result.scalar_one_or_none() is not None
    
    return {
        "available": not exists,
        "message": "電子郵件已被使用" if exists else "電子郵件可用"
    }


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    忘記密碼 - 申請重設代碼

    用戶提供帳號或電郵，後端產生一個 8 位數字代碼（有效期 24 小時）。
    用戶需聯繫管理員取得此代碼，再到重設痃碼頁面輸入。
    """
    # 查找用戶（支持 username 或 email）
    result = await db.execute(
        select(QueryUser).where(
            or_(
                QueryUser.username == request.username,
                QueryUser.email == request.username
            )
        )
    )
    user = result.scalar_one_or_none()

    # 無論用戶是否存在，一律回傳相同訊息（防止帳號列舉攻擊）
    if not user:
        return ForgotPasswordResponse(
            message="若帳號存在，重設申請已提交。請聯繫管理員取得重設代碼。"
        )

    # 產生 8 位大寫字母+數字代碼
    token = secrets.token_hex(4).upper()  # 8位十六進字串
    expires = datetime.utcnow() + timedelta(hours=24)

    user.reset_password_token = token
    user.reset_token_expires = expires
    await db.commit()

    return ForgotPasswordResponse(
        message="重設申請已提交。請聯繫管理員取得重設代碼（有效期 24 小時）。"
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    使用重設代碼設定新密碼
    """
    result = await db.execute(
        select(QueryUser).where(
            QueryUser.reset_password_token == request.reset_token.upper()
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="重設代碼無效，請重新申請"
        )

    if user.reset_token_expires and datetime.utcnow() > user.reset_token_expires:
        user.reset_password_token = None
        user.reset_token_expires = None
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="重設代碼已過期，請重新申請"
        )

    # 更新密碼並清除重設代碼
    user.hashed_password = get_password_hash(request.new_password)
    user.reset_password_token = None
    user.reset_token_expires = None
    await db.commit()

    return ResetPasswordResponse(message="密碼已成功重設，請使用新密碼登入。")


@router.post("/change-password", response_model=ResetPasswordResponse)
async def change_password(
    request: ChangePasswordRequest,
    current_user: QueryUser = Depends(get_current_query_user),
    db: AsyncSession = Depends(get_db)
):
    """
    已登入用戶修改密碼（需提供舊密碼驗證）
    """
    if not verify_password(request.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="目前密碼错誤"
        )

    current_user.hashed_password = get_password_hash(request.new_password)
    await db.commit()

    return ResetPasswordResponse(message="密碼已成功修改。")
