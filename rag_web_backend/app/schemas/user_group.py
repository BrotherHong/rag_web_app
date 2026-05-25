"""用戶身分組相關的 Pydantic Schemas"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime


class UserGroupBase(BaseModel):
    """身分組基礎 Schema"""
    name: str = Field(..., min_length=1, max_length=100, description="身分組名稱")
    description: Optional[str] = Field(None, description="身分組描述")
    priority: int = Field(default=100, ge=0, description="優先級（數字越小權限越高）")
    color: str = Field(default="#3B82F6", description="顏色標識")


class UserGroupBrief(BaseModel):
    """身分組簡要資訊"""
    id: int
    name: str
    color: str = "#3B82F6"
    priority: int = 100
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class UserGroupCreate(UserGroupBase):
    """建立身分組"""
    pass


class UserGroupUpdate(BaseModel):
    """更新身分組（所有欄位可選）"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    priority: Optional[int] = Field(None, ge=0)
    color: Optional[str] = None


class UserGroupSchema(UserGroupBase):
    """身分組資訊 Schema"""
    id: int
    department_id: int = Field(serialization_alias="departmentId")
    member_count: Optional[int] = Field(default=0, serialization_alias="memberCount", description="成員數量")
    file_count: Optional[int] = Field(default=0, serialization_alias="fileCount", description="可訪問檔案數")
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class UserGroupListResponse(BaseModel):
    """身分組列表回應"""
    items: List[UserGroupSchema]


class UserGroupDetailSchema(UserGroupSchema):
    """身分組詳細資訊（包含成員列表）"""
    members: List[dict] = Field(default_factory=list, description="成員列表")
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class FileUserGroupPermissionSchema(BaseModel):
    """檔案身分組權限 Schema"""
    id: int
    file_id: int = Field(serialization_alias="fileId")
    user_group_id: int = Field(serialization_alias="userGroupId")
    user_group_name: Optional[str] = Field(None, serialization_alias="userGroupName")
    created_at: datetime = Field(serialization_alias="createdAt")
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class SetFileUserGroupPermissionsRequest(BaseModel):
    """設定檔案身分組權限請求"""
    file_id: int = Field(..., description="檔案 ID")
    user_group_ids: List[int] = Field(..., description="身分組 ID 列表")


class BatchSetFileUserGroupPermissionsRequest(BaseModel):
    """批次設定檔案身分組權限請求"""
    file_ids: List[int] = Field(..., description="檔案 ID 列表")
    user_group_ids: List[int] = Field(..., description="身分組 ID 列表")
