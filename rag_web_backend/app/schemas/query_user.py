"""查詢用戶相關的 Pydantic Schemas"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime


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
    organization: Optional[str] = Field(None, max_length=200, description="所屬單位/組織")
    application_reason: str = Field(..., min_length=10, description="申請理由")
    
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


# ==================== 用戶資訊相關 ====================

class QueryUserInfo(BaseModel):
    """查詢用戶基本資訊"""
    id: int
    username: str
    email: str
    full_name: str
    organization: Optional[str] = None
    status: str
    is_active: bool
    default_department_id: Optional[int] = None
    max_queries_per_day: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class QueryUserDetail(QueryUserInfo):
    """查詢用戶詳細資訊（管理員視角）"""
    application_reason: Optional[str] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    admin_notes: Optional[str] = None
    updated_at: datetime
    default_department: Optional[DepartmentBrief] = None
    approver: Optional[UserBrief] = None
    
    class Config:
        from_attributes = True


# ==================== 管理員審批相關 ====================

class QueryUserApprovalRequest(BaseModel):
    """審批查詢用戶申請"""
    approve: bool = Field(..., description="true=批准, false=拒絕")
    rejection_reason: Optional[str] = Field(None, description="拒絕理由（拒絕時必填）")
    default_department_id: Optional[int] = Field(None, description="預設可見處室 ID")
    max_queries_per_day: Optional[int] = Field(None, description="每日查詢次數限制")
    admin_notes: Optional[str] = Field(None, description="管理員備註")
    
    @field_validator('rejection_reason')
    @classmethod
    def validate_rejection_reason(cls, v: Optional[str], info) -> Optional[str]:
        # 如果拒絕申請，必須提供拒絕理由
        if info.data.get('approve') is False and not v:
            raise ValueError('拒絕申請時必須提供拒絕理由')
        return v


class QueryUserCreateRequest(BaseModel):
    """管理員直接創建查詢用戶（無需審批）"""
    username: str = Field(..., min_length=3, max_length=50, description="使用者名稱")
    email: EmailStr = Field(..., description="電子郵件")
    password: str = Field(..., min_length=6, description="密碼")
    full_name: str = Field(..., min_length=1, max_length=100, description="全名")
    organization: Optional[str] = Field(None, max_length=200, description="所屬單位/組織")
    default_department_id: Optional[int] = Field(None, description="預設可見處室 ID")

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
    admin_notes: Optional[str] = None


# ==================== 文件權限相關 ====================

class FilePermissionCreate(BaseModel):
    """創建文件權限"""
    file_id: int = Field(..., description="文件 ID")
    notes: Optional[str] = Field(None, description="權限備註")


class FilePermissionBatchCreate(BaseModel):
    """批量創建文件權限"""
    file_ids: List[int] = Field(..., description="文件 ID 列表")
    notes: Optional[str] = Field(None, description="權限備註")


class FilePermissionInfo(BaseModel):
    """文件權限資訊"""
    id: int
    query_user_id: int
    file_id: int
    granted_by: Optional[int] = None
    granted_at: datetime
    notes: Optional[str] = None
    
    class Config:
        from_attributes = True


class FilePermissionDetail(FilePermissionInfo):
    """文件權限詳細資訊（包含關聯資料）"""
    file_name: Optional[str] = None
    category_name: Optional[str] = None
    department_name: Optional[str] = None
    is_public: Optional[bool] = None  # 檔案是否公開
    user_name: Optional[str] = None
    granter_name: Optional[str] = None
    
    class Config:
        from_attributes = True


# ==================== 列表查詢相關 ====================

class QueryUserListResponse(BaseModel):
    """查詢用戶列表回應"""
    items: List[QueryUserDetail]
    total: int
    page: int
    limit: int
    pages: int


class FilePermissionListResponse(BaseModel):
    """文件權限列表回應"""
    items: List[FilePermissionDetail]
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
