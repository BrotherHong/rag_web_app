"""Pydantic Schemas - 用於 API 請求/響應的資料驗證"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ===== 使用者 Schemas =====

class UserBase(BaseModel):
    """使用者基礎欄位"""
    username: str = Field(..., min_length=3, max_length=50, description="使用者名稱")
    email: EmailStr = Field(..., description="電子郵件")
    full_name: str = Field(..., min_length=1, max_length=100, description="全名")


class UserCreate(UserBase):
    """建立使用者請求"""
    password: str = Field(..., min_length=6, max_length=128, description="密碼")
    department_id: int = Field(..., description="所屬處室 ID")


class UserUpdate(BaseModel):
    """更新使用者請求"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    department_id: Optional[int] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128, description="新密碼（選填）")
    admin_group_id: Optional[int] = Field(None, description="管理組織 ID（None 表示移除，0 表示不變更）")


class UserResponse(UserBase):
    """使用者響應"""
    id: int
    role: str
    is_active: bool
    department_id: Optional[int]
    admin_group_id: Optional[int] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    """使用者列表響應"""
    items: list[UserResponse]
    total: int
    page: int
    page_size: int
    pages: int


class UserListResponse(BaseModel):
    """使用者列表響應"""
    items: list[UserResponse]
    total: int
    page: int
    page_size: int
    pages: int


# ===== 認證 Schemas =====

class Token(BaseModel):
    """JWT Token 響應"""
    access_token: str = Field(..., description="JWT Access Token")
    token_type: str = Field(default="bearer", description="Token 類型")


class LoginRequest(BaseModel):
    """登入請求"""
    username: str = Field(..., description="使用者名稱")
    password: str = Field(..., description="密碼")


class ChangePasswordRequest(BaseModel):
    """修改密碼請求"""
    old_password: str = Field(..., description="舊密碼")
    new_password: str = Field(..., min_length=6, max_length=128, description="新密碼")


class LoginResponse(BaseModel):
    """登入響應（前端期望格式）"""
    token: str = Field(..., description="JWT Token")
    user: dict = Field(..., description="使用者資訊")


# ===== 處室 Schemas =====

class DepartmentBase(BaseModel):
    """處室基礎欄位"""
    name: str = Field(..., min_length=1, max_length=100, description="處室名稱")
    slug: str = Field(..., min_length=1, max_length=50, description="URL 友善識別碼")
    description: Optional[str] = Field(None, description="處室描述")
    color: str = Field(default="#3B82F6", description="處室主題顏色 (hex格式)")


class DepartmentCreate(BaseModel):
    """建立處室請求"""
    name: str = Field(..., min_length=1, max_length=100, description="處室名稱")
    slug: str = Field(..., min_length=1, max_length=50, description="URL 友善識別碼 (例: hr, acc, it)")
    description: Optional[str] = Field(None, description="處室描述")
    color: str = Field(default="#3B82F6", description="處室主題顏色 (hex格式)")
    external_api_key: Optional[str] = Field(None, max_length=500, description="外部 LLM API Key（選填）")
    login_methods: list[str] = Field(
        default_factory=lambda: ["normal", "success_portal"],
        description="登入方式（normal, success_portal, google）"
    )


class DepartmentUpdate(BaseModel):
    """更新處室請求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="處室名稱")
    description: Optional[str] = Field(None, description="處室描述")
    color: Optional[str] = Field(None, description="處室主題顏色")
    external_api_key: Optional[str] = Field(None, max_length=500, description="外部 LLM API Key（選填，傳 null 可清除）")
    login_methods: Optional[list[str]] = Field(None, description="登入方式（normal, success_portal, google）")


class DepartmentResponse(DepartmentBase):
    """處室響應"""
    id: int
    has_external_api_key: bool = Field(default=False, description="是否已設定外部 API Key")
    login_methods: list[str] = Field(default_factory=lambda: ["normal", "success_portal"], description="啟用的登入方式")
    assistant_name: Optional[str] = Field(None, description="自訂助手名稱")
    assistant_style: Optional[str] = Field(None, description="助手回答風格描述")
    enable_direct_query: bool = Field(default=True, description="是否啟用 AI 通用知識回答功能")
    user_count: int = Field(default=0, description="使用者數量")
    file_count: int = Field(default=0, description="檔案數量")
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DepartmentListResponse(BaseModel):
    """處室列表響應"""
    items: list[DepartmentResponse]
    total: int
    page: int
    pages: int


class DepartmentStatsResponse(BaseModel):
    """處室統計響應"""
    department_id: int = Field(..., description="處室 ID")
    department_name: str = Field(..., description="處室名稱")
    user_count: int = Field(..., description="使用者數量")
    active_user_count: int = Field(..., description="啟用使用者數量")
    file_count: int = Field(..., description="檔案數量")
    total_file_size: int = Field(..., description="檔案總大小（bytes）")
    activity_count: int = Field(..., description="活動記錄數量")
    recent_activities: list[dict] = Field(..., description="最近活動")


class DepartmentLoginMethodsUpdate(BaseModel):
    """更新當前處室登入方式"""
    login_methods: list[str] = Field(..., min_length=1, description="登入方式（normal, success_portal, google）")


class DepartmentLoginMethodsResponse(BaseModel):
    """當前處室登入方式"""
    department_id: int = Field(..., description="處室 ID")
    department_name: str = Field(..., description="處室名稱")
    login_methods: list[str] = Field(..., description="啟用的登入方式")


# ===== 通用 Schemas =====

class MessageResponse(BaseModel):
    """通用訊息響應"""
    message: str = Field(..., description="訊息內容")
    detail: Optional[str] = Field(None, description="詳細資訊")


__all__ = [
    # 使用者
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserListResponse",
    # 認證
    "Token",
    "LoginRequest",
    "ChangePasswordRequest",
    "LoginResponse",
    # 處室
    "DepartmentBase",
    "DepartmentCreate",
    "DepartmentUpdate",
    "DepartmentResponse",
    "DepartmentListResponse",
    "DepartmentStatsResponse",
    "DepartmentLoginMethodsUpdate",
    "DepartmentLoginMethodsResponse",
    # 通用
    "MessageResponse",
]

# 註: 檔案和分類的 Schemas 在各自的模組中
# from app.schemas.file import *
# from app.schemas.category import *
