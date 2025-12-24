"""常見問題模型"""

from typing import TYPE_CHECKING
from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.department import Department


class FAQ(Base, TimestampMixin):
    """常見問題表"""
    
    __tablename__ = "faqs"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="FAQ ID")
    
    # 處室關聯（可選，null 表示全站通用）
    department_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="處室 ID"
    )
    
    # 基本資料
    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="分類"
    )
    
    question: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        comment="問題"
    )
    
    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="問題描述（用於卡片顯示）"
    )
    
    answer: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="詳細解答"
    )
    
    icon: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
        comment="圖示 emoji"
    )
    
    order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="排序順序"
    )
    
    # 是否啟用
    is_active: Mapped[bool] = mapped_column(
        default=True,
        nullable=False,
        comment="是否啟用"
    )
    
    # 關聯
    department: Mapped["Department | None"] = relationship(
        "Department",
        foreign_keys=[department_id]
    )
    
    def __repr__(self) -> str:
        return f"<FAQ(id={self.id}, question='{self.question[:30]}...')>"
    
    def to_dict(self) -> dict:
        """轉換為字典"""
        return {
            "id": self.id,
            "category": self.category,
            "question": self.question,
            "description": self.description,
            "answer": self.answer,
            "icon": self.icon,
            "order": self.order,
            "department_id": self.department_id,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
