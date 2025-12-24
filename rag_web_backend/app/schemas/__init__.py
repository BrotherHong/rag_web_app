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


class PasswordChange(BaseModel):
    """修改密碼請求"""
    old_password: str = Field(..., min_length=6, description="舊密碼")
    new_password: str = Field(..., min_length=6, max_length=128, description="新密碼")


class UserResponse(UserBase):
    """使用者響應"""
    id: int
    role: str
    is_active: bool
    department_id: Optional[int]  # super_admin 可以沒有 department_id
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    """使用者列表響應"""
    items: list[UserResponse]
    total: int
    page: int
    page_size: int
    pages: int


class UserStatsResponse(BaseModel):
    """使用者統計響應"""
    total_users: int = Field(..., description="總使用者數")
    active_users: int = Field(..., description="啟用使用者數")
    inactive_users: int = Field(..., description="停用使用者數")
    users_by_role: dict[str, int] = Field(..., description="依角色統計")
    users_by_department: list[dict] = Field(..., description="依處室統計")
    recent_logins: list[dict] = Field(..., description="最近登入記錄")
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ===== 認證 Schemas =====

class Token(BaseModel):
    """JWT Token 響應"""
    access_token: str = Field(..., description="JWT Access Token")
    token_type: str = Field(default="bearer", description="Token 類型")


class TokenData(BaseModel):
    """Token 中包含的資料"""
    user_id: Optional[int] = None


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


class DepartmentUpdate(BaseModel):
    """更新處室請求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="處室名稱")
    description: Optional[str] = Field(None, description="處室描述")
    color: Optional[str] = Field(None, description="處室主題顏色")


class DepartmentResponse(DepartmentBase):
    """處室響應"""
    id: int
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


# ===== 通用 Schemas =====

class MessageResponse(BaseModel):
    """通用訊息響應"""
    message: str = Field(..., description="訊息內容")
    detail: Optional[str] = Field(None, description="詳細資訊")


class PaginationParams(BaseModel):
    """分頁參數"""
    skip: int = Field(default=0, ge=0, description="跳過筆數")
    limit: int = Field(default=20, ge=1, le=100, description="每頁筆數")


__all__ = [
    # 使用者
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "PasswordChange",
    "UserResponse",
    "UserListResponse",
    "UserStatsResponse",
    # 認證
    "Token",
    "TokenData",
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
    # 通用
    "MessageResponse",
    "PaginationParams",
]

# 註: 檔案和分類的 Schemas 在各自的模組中
# from app.schemas.file import *
# from app.schemas.category import *
