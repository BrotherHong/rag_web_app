"""活動記錄相關的 Pydantic Schema"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class ActivityBase(BaseModel):
    """活動記錄基礎 Schema"""
    
    activity_type: str = Field(..., description="活動類型")
    description: str = Field(..., description="活動描述")


class ActivityDetail(ActivityBase):
    """活動記錄詳情"""
    
    id: int
    user_id: int
    file_id: Optional[int] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    extra_data: Optional[str] = None
    created_at: datetime
    
    # 關聯資訊
    user: Optional[Dict[str, Any]] = None
    file: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True


class ActivityListItem(BaseModel):
    """活動記錄列表項目"""
    
    id: int
    activity_type: str
    description: str
    user_id: int
    username: str = Field(..., description="使用者名稱")
    user_full_name: str = Field(..., description="使用者全名")
    file_id: Optional[int] = None
    file_name: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    department_id: Optional[int] = Field(None, description="處室 ID")
    department_name: Optional[str] = Field(None, description="處室名稱")
    
    class Config:
        from_attributes = True


class ActivityListResponse(BaseModel):
    """活動記錄列表回應"""
    
    items: list[ActivityListItem]
    total: int
    page: int
    pages: int


class ActivityStatsResponse(BaseModel):
    """活動統計回應"""
    
    total_activities: int = Field(..., description="總活動數")
    activities_today: int = Field(..., description="今日活動數")
    activities_this_week: int = Field(..., description="本週活動數")
    activities_this_month: int = Field(..., description="本月活動數")
    by_type: Dict[str, int] = Field(..., description="依類型統計")
    by_user: list[Dict[str, Any]] = Field(..., description="依使用者統計（前10）")
    recent_activities: list[ActivityListItem] = Field(..., description="最近活動（前10）")
    
    class Config:
        json_schema_extra = {
            "example": {
                "total_activities": 1250,
                "activities_today": 45,
                "activities_this_week": 320,
                "activities_this_month": 1100,
                "by_type": {
                    "login": 180,
                    "upload": 95,
                    "download": 230,
                    "query": 450,
                    "search": 295
                },
                "by_user": [
                    {
                        "user_id": 1,
                        "username": "admin",
                        "full_name": "系統管理員",
                        "activity_count": 350
                    }
                ],
                "recent_activities": []
            }
        }
