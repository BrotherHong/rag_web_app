"""管理組織 Schema"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, field_validator


class AdminGroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#3B82F6"


class AdminGroupCreate(AdminGroupBase):
    department_id: int

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("名稱不得為空")
        return v


class AdminGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("名稱不得為空")
        return v


class AdminGroupSchema(AdminGroupBase):
    id: int
    department_id: int
    created_at: datetime
    updated_at: datetime

    # 統計用
    user_count: int = 0
    file_count: int = 0

    class Config:
        from_attributes = True


class AdminGroupListResponse(BaseModel):
    items: List[AdminGroupSchema]
    total: int
