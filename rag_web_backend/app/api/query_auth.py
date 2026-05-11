"""查詢用戶認證 API 路由

專門用於前端查詢系統的登入、密碼重設等功能
與後台管理員系統完全獨立
"""

from datetime import datetime, timedelta, timezone
import base64
import hashlib
import json
import secrets
from typing import Optional
from urllib.parse import urlparse, quote, unquote
from fastapi import APIRouter, Depends, HTTPException, Request, status, Header
from app.core.limiter import limiter
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
import httpx

from app.config import settings
from app.core.database import get_db
from app.core.security import (
    get_password_hash,
    verify_password,
    authenticate_query_user,
    create_query_user_token,
    create_google_query_token,
    create_portal_query_token,
    get_current_query_user
)
from app.models.query_user import QueryUser, QueryUserStatus
from app.schemas.query_user import (
    QueryUserLoginRequest,
    QueryUserLoginResponse,
    GoogleLoginRequest,
    QuerySessionLoginResponse,
    QuerySessionUserInfo,
    QueryUserInfo,
    QueryMeResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    ChangePasswordRequest,
)

router = APIRouter(prefix="/query-auth", tags=["查詢用戶認證"])


@router.post("/login", response_model=QueryUserLoginResponse)
@limiter.limit("10/minute")
async def login_query_user(
    request: Request,
    body: QueryUserLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    查詢用戶登入
    
    使用 username 或 email 都可以登入
    """
    # 驗證用戶
    query_user = await authenticate_query_user(db, body.username, body.password)
    
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


@router.post("/google-login", response_model=QuerySessionLoginResponse)
async def google_login(
    request: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Google 登入：只建立 session，不寫入 QueryUser 資料表"""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google 登入尚未啟用"
        )

    try:
        token_info = google_id_token.verify_oauth2_token(
            request.id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google 身份驗證失敗"
        )

    issuer = token_info.get("iss")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google Token 發行者無效"
        )

    email = token_info.get("email")
    google_sub = token_info.get("sub")
    full_name = token_info.get("name") or email
    email_verified = token_info.get("email_verified", False)

    if not email or not google_sub or not email_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google 帳號資訊不完整或未驗證"
        )

    # 僅防重名提示：Google 登入不建立 QueryUser，避免出現在查詢用戶管理中
    _ = await db.execute(select(QueryUser.id).where(QueryUser.email == email))

    access_token = create_google_query_token(
        google_sub=str(google_sub),
        email=email,
        name=full_name,
    )

    iat = token_info.get("iat")
    created_at = datetime.fromtimestamp(iat, tz=timezone.utc) if isinstance(iat, (int, float)) else datetime.now(timezone.utc)

    session_user = QuerySessionUserInfo(
        id=f"google:{google_sub}",
        username=email.split("@")[0],
        email=email,
        full_name=full_name,
        status="approved",
        is_active=True,
        default_department_id=None,
        max_queries_per_day=None,
        created_at=created_at,
        auth_provider="google",
        is_managed_user=False,
    )

    return QuerySessionLoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=session_user,
    )


@router.get("/me", response_model=QueryMeResponse)
async def get_current_query_user_info(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """
    獲取當前查詢用戶資訊
    
    需要登入（支援一般 QueryUser 與 Google session）
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供登入憑證"
        )

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="無法驗證憑證",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = authorization.replace("Bearer ", "")

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_type = payload.get("type")
    except JWTError:
        raise credentials_exception

    if user_type == "query_user":
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception

        result = await db.execute(
            select(QueryUser).where(QueryUser.id == int(user_id))
        )
        query_user = result.scalar_one_or_none()
        if query_user is None:
            raise credentials_exception

        return QueryUserInfo.model_validate(query_user)

    if user_type == "query_google":
        google_sub = payload.get("sub")
        email = payload.get("email")
        name = payload.get("name")
        issued_at = payload.get("iat")

        if not google_sub or not email or not name:
            raise credentials_exception

        created_at = datetime.fromtimestamp(issued_at, tz=timezone.utc) if isinstance(issued_at, (int, float)) else datetime.now(timezone.utc)

        return QuerySessionUserInfo(
            id=f"google:{google_sub}",
            username=email.split("@")[0],
            email=email,
            full_name=name,
            status="approved",
            is_active=True,
            default_department_id=None,
            max_queries_per_day=None,
            created_at=created_at,
            auth_provider="google",
            is_managed_user=False,
        )

    if user_type == "query_portal":
        commonname = payload.get("sub", "")
        email = payload.get("email", "")
        name = payload.get("name", commonname)
        issued_at = payload.get("iat")

        if not commonname:
            raise credentials_exception

        created_at = datetime.fromtimestamp(issued_at, tz=timezone.utc) if isinstance(issued_at, (int, float)) else datetime.now(timezone.utc)

        return QuerySessionUserInfo(
            id=f"portal:{commonname}",
            username=commonname,
            email=email,
            full_name=name,
            status="approved",
            is_active=True,
            default_department_id=None,
            max_queries_per_day=None,
            created_at=created_at,
            auth_provider="success_portal",
            is_managed_user=False,
        )

    raise credentials_exception


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

    # 存 hash，不存明文，防止 DB 洩漏時直接被利用
    user.reset_password_token = hashlib.sha256(token.encode()).hexdigest()
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
    token_hash = hashlib.sha256(request.reset_token.upper().encode()).hexdigest()
    result = await db.execute(
        select(QueryUser).where(
            QueryUser.reset_password_token == token_hash
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


# ==================== 成功入口（NCKU ADFS SSO）====================

PORTAL_AUTH_ENDPOINT = "https://fs.ncku.edu.tw/adfs/oauth2/authorize"
PORTAL_TOKEN_ENDPOINT = "https://fs.ncku.edu.tw/adfs/oauth2/token"
PORTAL_LOGOUT_ENDPOINT = "https://fs.ncku.edu.tw/adfs/oauth2/logout"


@router.get("/portal-logout")
async def portal_logout():
    """登出成功入口：清除 ADFS session cookie，完成後導回前端首頁"""
    if not settings.PORTAL_REDIRECT_URI:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="成功入口登入尚未啟用"
        )
    parsed = urlparse(settings.PORTAL_REDIRECT_URI)
    post_logout_uri = f"{parsed.scheme}://{parsed.netloc}/query/"
    logout_url = f"{PORTAL_LOGOUT_ENDPOINT}?post_logout_redirect_uri={quote(post_logout_uri, safe='')}"
    return RedirectResponse(url=logout_url, status_code=302)


@router.get("/portal-login")
async def portal_login(from_path: str = "/"):
    """發起成功入口 SSO 登入，重定向到 NCKU ADFS 授權頁"""
    if not settings.PORTAL_CLIENT_ID or not settings.PORTAL_REDIRECT_URI:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="成功入口登入尚未啟用，請聯系管理員"
        )

    state = from_path
    # resource 對應 NCKUAIDEMO relying party（使用 redirect_uri 本身）
    params = {
        "response_type": "code",
        "client_id": settings.PORTAL_CLIENT_ID,
        "redirect_uri": settings.PORTAL_REDIRECT_URI,
        "state": state,
        "resource": settings.PORTAL_REDIRECT_URI,
    }
    query_string = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
    auth_url = f"{PORTAL_AUTH_ENDPOINT}?{query_string}"
    return RedirectResponse(url=auth_url, status_code=302)


@router.get("/portal-callback")
async def portal_callback(code: str, state: str = "/"):
    """處理成功入口 SSO 回調，換取 token 後重定向到前端"""
    if not settings.PORTAL_CLIENT_ID or not settings.PORTAL_REDIRECT_URI:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="成功入口登入尚未啟用"
        )

    # 向 ADFS 換取 access_token
    async with httpx.AsyncClient(verify=False, timeout=15) as client:
        resp = await client.post(
            PORTAL_TOKEN_ENDPOINT,
            data={
                "grant_type": "authorization_code",
                "client_id": settings.PORTAL_CLIENT_ID,
                "client_secret": settings.PORTAL_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.PORTAL_REDIRECT_URI,
            },
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無法從成功入口取得 token"
        )

    token_data = resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="成功入口未返回有效 token"
        )

    # 解碼 JWT payload（不驗證簽名，同原始 PHP 邏輯）
    parts = access_token.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="成功入口 token 格式錯誤"
        )
    padding = 4 - len(parts[1]) % 4
    padded = parts[1] + ("=" * (padding % 4))
    user_info = json.loads(base64.urlsafe_b64decode(padded))

    commonname: str = user_info.get("commonname", "")
    email: str = user_info.get("email", "")
    fullname: str = user_info.get("fullname", "") or user_info.get("full_name", "")
    dn: str = user_info.get("DN", "")
    if "ou=students" in dn.lower():
        identity = "student"
    elif "ou=staff" in dn.lower():
        identity = "staff"
    else:
        identity = user_info.get("identity", "none")

    system_token = create_portal_query_token(
        commonname=commonname,
        email=email,
        identity=identity,
        fullname=fullname,
    )

    # 重定向到前端 callback 頁（React app 在 /query/ 下）
    parsed = urlparse(settings.PORTAL_REDIRECT_URI)
    frontend_base = f"{parsed.scheme}://{parsed.netloc}"
    from_path = unquote(state)
    redirect_url = f"{frontend_base}/query/login/portal-callback?token={quote(system_token, safe='')}&from={quote(from_path, safe='')}"
    return RedirectResponse(url=redirect_url, status_code=302)
