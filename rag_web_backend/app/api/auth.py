"""認證相關 API 路由"""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.models import User
from app.schemas import (
    Token,
    LoginRequest,
    UserResponse,
    ChangePasswordRequest,
    MessageResponse,
)
from app.config import settings
from app.services.activity import activity_service

router = APIRouter(prefix="/auth", tags=["認證"])


@router.post("/login", summary="使用者登入")
async def login(
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    使用者登入
    
    - **username**: 使用者名稱
    - **password**: 密碼
    
    返回 JWT Token 和使用者資訊（前端期望格式）
    """
    user = await authenticate_user(db, login_data.username, login_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="帳號或密碼錯誤",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="使用者帳號已停用"
        )
    
    # 建立 JWT Token
    access_token_expires = timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=access_token_expires
    )
    
    # 記錄登入活動
    await activity_service.log_activity(
        db=db,
        user_id=user.id,
        activity_type="LOGIN",
        description=f"使用者 {user.username} 登入系統",
        department_id=user.department_id
    )
    await db.commit()
    
    # 返回前端期望的格式: { token, user }
    return {
        "token": access_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "name": user.full_name,
            "fullName": user.full_name,
            "email": user.email,
            "role": user.role.value,
            "isSuperAdmin": user.role.value == "SUPER_ADMIN",
            "departmentId": user.department.id if user.department else None,
            "departmentName": user.department.name if user.department else None,
            "department": {
                "id": user.department.id if user.department else None,
                "name": user.department.name if user.department else None
            } if user.department else None
        }
    }


@router.post("/token", response_model=Token, summary="OAuth2 密碼流登入")
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db)
):
    """
    OAuth2 密碼流登入端點（供 Swagger UI 使用）
    
    - **username**: 使用者名稱
    - **password**: 密碼
    
    返回 JWT Access Token
    """
    user = await authenticate_user(db, form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="帳號或密碼錯誤",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="使用者帳號已停用"
        )
    
    access_token_expires = timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=access_token_expires
    )
    
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse, summary="取得當前使用者資訊")
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """
    取得當前已認證使用者的資訊
    
    需要提供有效的 JWT Token
    """
    return current_user


@router.get("/verify", summary="驗證 Token 有效性")
async def verify_token(
    current_user: User = Depends(get_current_user)
):
    """
    驗證 JWT Token 是否有效
    
    前端使用此端點檢查 Token 有效性
    返回格式: { success: true, user: {...} }
    """
    return {
        "success": True,
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "name": current_user.full_name,
            "email": current_user.email,
            "role": current_user.role.value,
            "isSuperAdmin": current_user.role.value == "SUPER_ADMIN",
            "departmentId": current_user.department_id,
            "departmentName": current_user.department.name if current_user.department else None
        },
        "message": "Token 有效"
    }


@router.post("/change-password", response_model=MessageResponse, summary="修改密碼")
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    修改當前使用者的密碼
    
    - **old_password**: 舊密碼
    - **new_password**: 新密碼（至少 6 個字元）
    """
    # 驗證舊密碼
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="舊密碼錯誤"
        )
    
    # 更新密碼
    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.add(current_user)
    await db.commit()
    
    return MessageResponse(
        message="密碼修改成功",
        detail="請使用新密碼重新登入"
    )


@router.post("/logout", response_model=MessageResponse, summary="使用者登出")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    使用者登出
    
    - 記錄登出活動
    - 客戶端需刪除 Token
    
    注意：由於使用 JWT，Token 在過期前仍然有效
    建議客戶端立即清除 localStorage 中的 Token
    """
    # 記錄登出活動
    from app.services.activity import activity_service
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="LOGOUT",
        description=f"{current_user.username} 登出系統",
        department_id=current_user.department_id
    )
    await db.commit()
    
    return MessageResponse(
        message="登出成功",
        detail="已記錄登出事件，請在客戶端刪除 Token"
    )
