"""安全性與認證核心功能

提供密碼加密、JWT Token 生成與驗證等功能
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.database import get_db
from app.models import User

# 密碼加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 密碼流
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    驗證密碼
    
    Args:
        plain_password: 明文密碼
        hashed_password: 雜湊密碼
        
    Returns:
        bool: 密碼是否正確
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    將明文密碼轉換為雜湊值
    
    Args:
        password: 明文密碼
        
    Returns:
        str: 雜湊後的密碼
    """
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    建立 JWT Access Token
    
    Args:
        data: 要編碼的資料（通常包含 sub: user_id）
        expires_delta: 過期時間（預設使用設定檔中的值）
        
    Returns:
        str: JWT Token
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    
    return encoded_jwt


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    x_proxy_department_id: Optional[str] = Header(None)
) -> User:
    """
    從 JWT Token 中取得當前使用者
    
    依賴注入函數，用於需要認證的路由
    
    支援 super_admin 代理模式：
    - 當 X-Proxy-Department-Id header 存在且使用者為 super_admin 時
    - 臨時覆蓋 user.department_id 為指定的處室 ID
    - 用於 super_admin 查看特定處室資料
    
    Args:
        token: JWT Token
        db: 資料庫 Session
        x_proxy_department_id: 代理的處室 ID（從 Header 取得）
        
    Returns:
        User: 當前使用者物件（可能包含代理 department_id）
        
    Raises:
        HTTPException: Token 無效或使用者不存在
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="無法驗證憑證",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # 解碼 JWT Token
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        
        if user_id is None:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
    
    # 從資料庫取得使用者
    result = await db.execute(
        select(User)
        .options(selectinload(User.department))
        .where(User.id == int(user_id))
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="使用者帳號已停用"
        )
    
    # 處理 super_admin 代理模式
    if x_proxy_department_id is not None:
        from app.models.user import UserRole
        
        # 只有 super_admin 可以使用代理功能
        if user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只有超級管理員可以使用代理功能"
            )
        
        # 驗證目標處室是否存在
        try:
            proxy_dept_id = int(x_proxy_department_id)
            from app.models.department import Department
            dept_result = await db.execute(
                select(Department).where(Department.id == proxy_dept_id)
            )
            department = dept_result.scalar_one_or_none()
            
            if department is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"處室 ID {proxy_dept_id} 不存在"
                )
            
            # 從 session 中移除 user 物件,防止後續的 commit 影響資料庫
            db.expunge(user)
            
            # 臨時覆蓋 department_id 和 department
            # 由於已經 expunge,這不會影響資料庫
            user.department_id = proxy_dept_id
            user.department = department
            
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="無效的處室 ID 格式"
            )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    取得當前啟用的使用者
    
    Args:
        current_user: 當前使用者
        
    Returns:
        User: 啟用的使用者物件
        
    Raises:
        HTTPException: 使用者未啟用
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="使用者帳號未啟用"
        )
    return current_user


async def get_current_active_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    取得當前啟用的管理員使用者
    
    Args:
        current_user: 當前使用者
        
    Returns:
        User: 管理員使用者物件
        
    Raises:
        HTTPException: 使用者不是管理員或帳號未啟用
    """
    from app.models.user import UserRole
    
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="使用者帳號未啟用"
        )
    
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理員權限"
        )
    
    return current_user


async def get_current_super_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    取得當前超級管理員使用者
    
    Args:
        current_user: 當前使用者
        
    Returns:
        User: 超級管理員使用者物件
        
    Raises:
        HTTPException: 使用者不是超級管理員
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="使用者帳號未啟用"
        )
    
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要超級管理員權限"
        )
    
    return current_user


async def authenticate_user(db: AsyncSession, username: str, password: str) -> Optional[User]:
    """
    驗證使用者帳號密碼
    
    Args:
        db: 資料庫 Session
        username: 使用者名稱
        password: 密碼
        
    Returns:
        Optional[User]: 驗證成功返回使用者物件，失敗返回 None
    """
    result = await db.execute(
        select(User)
        .options(selectinload(User.department))
        .where(User.username == username)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return None
    
    if not verify_password(password, user.hashed_password):
        return None
    
    return user


def require_role(*allowed_roles):
    """
    權限檢查裝飾器工廠
    
    建立一個依賴注入函數，檢查使用者是否具有指定角色
    
    Args:
        *allowed_roles: 允許的角色列表
        
    Returns:
        依賴注入函數
        
    Example:
        @router.get("/admin")
        async def admin_only(user: User = Depends(require_role(UserRole.ADMIN))):
            return {"message": "Admin access"}
    """
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="權限不足"
            )
        return current_user
    
    return role_checker
