"""查詢用戶相關的 Pydantic Schemas"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, TYPE_CHECKING, Union
from datetime import datetime

if TYPE_CHECKING:
    from .user_group import UserGroupBrief


# ==================== 處室簡要資訊 ====================

class DepartmentBrief(BaseModel):
    """處室簡要資訊"""
    id: int
    name: str
    
    class Config:
        from_attributes = True


class UserBrief(BaseModel):
    """用戶簡要資訊"""
    id: int
    username: str
    full_name: str
    
    class Config:
        from_attributes = True


# ==================== 註冊申請相關 ====================

class QueryUserRegisterRequest(BaseModel):
    """查詢用戶註冊申請"""
    username: str = Field(..., min_length=3, max_length=50, description="使用者名稱")
    email: EmailStr = Field(..., description="電子郵件")
    password: str = Field(..., min_length=6, description="密碼")
    full_name: str = Field(..., min_length=1, max_length=100, description="全名")
    application_reason: Optional[str] = Field(None, description="申請理由")
    default_department_id: Optional[int] = Field(None, description="預設處室 ID")
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('使用者名稱只能包含英文、數字、底線和連字號')
        return v


class QueryUserRegisterResponse(BaseModel):
    """註冊申請回應"""
    id: int
    username: str
    email: str
    status: str
    message: str = "註冊申請已提交，請等待管理員審批"


# ==================== 登入相關 ====================

class QueryUserLoginRequest(BaseModel):
    """查詢用戶登入請求"""
    username: str = Field(..., description="使用者名稱或電子郵件")
    password: str = Field(..., description="密碼")


class QueryUserLoginResponse(BaseModel):
    """查詢用戶登入回應"""
    access_token: str
    token_type: str = "bearer"
    user: "QueryUserInfo"


class GoogleLoginRequest(BaseModel):
    """Google 登入請求"""
    id_token: str = Field(..., description="Google ID Token")


class QuerySessionUserInfo(BaseModel):
    """查詢端 session 用戶資訊（可來自外部身份提供者）"""
    id: str
    username: str
    email: str
    full_name: str
    status: str = "approved"
    is_active: bool = True
    default_department_id: Optional[int] = None
    max_queries_per_day: Optional[int] = None
    created_at: datetime
    auth_provider: str = "normal"
    is_managed_user: bool = True


class QuerySessionLoginResponse(BaseModel):
    """查詢端登入回應（一般/外部提供者共用）"""
    access_token: str
    token_type: str = "bearer"
    user: QuerySessionUserInfo


# ==================== 用戶資訊相關 ====================

class QueryUserInfo(BaseModel):
    """查詢用戶基本資訊"""
    id: int
    username: str
    email: str
    full_name: str
    status: str
    is_active: bool
    default_department_id: Optional[int] = None
    max_queries_per_day: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


QueryMeResponse = Union[QueryUserInfo, QuerySessionUserInfo]


class QueryUserDetail(QueryUserInfo):
    """查詢用戶詳細資訊（管理員視角）"""
    application_reason: Optional[str] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    show_source_docs: bool = True
    admin_notes: Optional[str] = None
    updated_at: datetime
    default_department: Optional[DepartmentBrief] = None
    default_department_id: Optional[int] = None
    approver: Optional[UserBrief] = None
    user_groups: List["UserGroupBrief"] = []
    reset_password_token: Optional[str] = None
    reset_token_expires: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class QueryUserCreateRequest(BaseModel):
    """管理員直接創建查詢用戶（無需審批）"""
    username: str = Field(..., min_length=3, max_length=50, description="使用者名稱")
    email: EmailStr = Field(..., description="電子郵件")
    password: str = Field(..., min_length=6, description="密碼")
    full_name: str = Field(..., min_length=1, max_length=100, description="全名")
    default_department_id: Optional[int] = Field(None, description="預設可見處室 ID")
    user_group_ids: Optional[List[int]] = Field(None, description="身分組 ID 列表")
    show_source_docs: bool = Field(True, description="query 前端是否顯示來源文檔")
    admin_notes: Optional[str] = Field(None, description="管理員備註")
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('使用者名稱只能包含英文、數字、底線和連字號')
        return v


class QueryUserUpdateRequest(BaseModel):
    """更新查詢用戶資訊（管理員）"""
    is_active: Optional[bool] = None
    default_department_id: Optional[int] = None
    max_queries_per_day: Optional[int] = None
    show_source_docs: Optional[bool] = None
    admin_notes: Optional[str] = None
    user_group_ids: Optional[List[int]] = None


# ==================== 列表查詢相關 ====================

class QueryUserListResponse(BaseModel):
    """查詢用戶列表回應"""
    items: List[QueryUserDetail]
    total: int
    page: int
    limit: int
    pages: int


# ==================== 統計相關 ====================

class QueryUserStats(BaseModel):
    """查詢用戶統計"""
    total: int
    pending: int
    approved: int
    rejected: int
    suspended: int
    active: int
    inactive: int


# ==================== 密碼重設相關 ====================

class ForgotPasswordRequest(BaseModel):
    """忘記密碼請求"""
    username: str = Field(..., description="使用者名稱或電子郵件")


class ForgotPasswordResponse(BaseModel):
    """忘記密碼回應"""
    message: str


class ResetPasswordRequest(BaseModel):
    """重設密碼請求"""
    reset_token: str = Field(..., description="管理員提供的重設代碼")
    new_password: str = Field(..., min_length=6, description="新密碼")


class ResetPasswordResponse(BaseModel):
    """重設密碼回應"""
    message: str


class ChangePasswordRequest(BaseModel):
    """已登入用戶修改密碼"""
    old_password: str = Field(..., description="目前密碼")
    new_password: str = Field(..., min_length=6, description="新密碼")


# 解決 forward reference
from .user_group import UserGroupBrief
QueryUserDetail.model_rebuild()
