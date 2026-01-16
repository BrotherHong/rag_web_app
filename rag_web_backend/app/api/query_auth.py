"""查詢用戶認證 API 路由

專門用於前端查詢系統的用戶註冊、登入等功能
與後台管理員系統完全獨立
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    get_password_hash,
    authenticate_query_user,
    create_query_user_token,
    get_current_query_user
)
from app.models.query_user import QueryUser, QueryUserStatus
from app.schemas.query_user import (
    QueryUserRegisterRequest,
    QueryUserRegisterResponse,
    QueryUserLoginRequest,
    QueryUserLoginResponse,
    QueryUserInfo
)

router = APIRouter(prefix="/query-auth", tags=["查詢用戶認證"])


@router.post("/register", response_model=QueryUserRegisterResponse)
async def register_query_user(
    request: QueryUserRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    查詢用戶註冊申請
    
    提交註冊申請後，需要等待後台管理員審批
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
    
    # 創建查詢用戶（狀態為待審批）
    query_user = QueryUser(
        username=request.username,
        email=request.email,
        hashed_password=get_password_hash(request.password),
        full_name=request.full_name,
        organization=request.organization,
        application_reason=request.application_reason,
        status=QueryUserStatus.PENDING,
        is_active=True
    )
    
    db.add(query_user)
    await db.commit()
    await db.refresh(query_user)
    
    return QueryUserRegisterResponse(
        id=query_user.id,
        username=query_user.username,
        email=query_user.email,
        status=query_user.status.value,
        message="註冊申請已提交，請等待管理員審批。審批通過後您將收到電子郵件通知。"
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
    
    # 檢查審批狀態
    if query_user.status == QueryUserStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您的申請尚未通過審批，請等待管理員處理"
        )
    elif query_user.status == QueryUserStatus.REJECTED:
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
