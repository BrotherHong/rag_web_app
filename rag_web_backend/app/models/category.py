"""分類模型"""

from typing import List, TYPE_CHECKING
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.file import File
    from app.models.department import Department


class Category(Base, TimestampMixin):
    """分類表"""
    
    __tablename__ = "categories"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="分類 ID")
    
    # 基本資料
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="分類名稱"
    )
    
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="分類描述"
    )
    
    color: Mapped[str] = mapped_column(
        String(20),
        default="blue",
        nullable=False,
        comment="分類顏色"
    )
    
    # 外鍵
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="處室 ID"
    )
    
    # 關聯
    files: Mapped[List["File"]] = relationship(
        "File",
        back_populates="category"
    )
    
    department: Mapped["Department"] = relationship(
        "Department",
        back_populates="categories"
    )
    
    def __repr__(self) -> str:
        return f"<Category(id={self.id}, name='{self.name}', department_id={self.department_id})>"
