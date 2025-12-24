"""FAQ 管理相關的 Pydantic Schemas"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime


class FaqBase(BaseModel):
    """FAQ 基礎 Schema"""
    category: str = Field(..., description="分類")
    question: str = Field(..., min_length=1, max_length=500, description="問題")
    description: Optional[str] = Field(None, max_length=500, description="問題描述")
    answer: Optional[str] = Field(None, description="詳細解答")
    icon: Optional[str] = Field(None, max_length=10, description="圖示 emoji")
    order: int = Field(default=0, description="排序順序")
    is_active: bool = Field(default=True, description="是否啟用")


class FaqCreate(FaqBase):
    """創建 FAQ"""
    pass


class FaqUpdate(BaseModel):
    """更新 FAQ（所有欄位可選）"""
    category: Optional[str] = None
    question: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=500)
    answer: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=10)
    order: Optional[int] = None
    is_active: Optional[bool] = None


class FaqToggle(BaseModel):
    """FAQ 啟用狀態切換"""
    is_active: bool


class FaqReorder(BaseModel):
    """FAQ 重新排序"""
    faq_ids: List[int] = Field(..., description="FAQ ID 列表（按新順序排列）")


class FaqSchema(FaqBase):
    """FAQ 資訊 Schema（完整資訊）"""
    id: int
    department_id: Optional[int] = Field(None, description="處室 ID（null 表示全站通用）")
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
