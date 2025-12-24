"""查詢歷史模型"""

from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, ForeignKey, Text, Float, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.department import Department


class QueryHistory(Base, TimestampMixin):
    """查詢歷史表"""
    
    __tablename__ = "query_history"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="查詢歷史 ID")
    
    # 查詢內容
    query: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="查詢問題"
    )
    
    answer: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="生成的答案"
    )
    
    # 來源資訊
    sources: Mapped[dict] = mapped_column(
        JSON,
        nullable=True,
        comment="來源文檔 JSON"
    )
    
    source_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="來源數量"
    )
    
    # 查詢參數
    query_type: Mapped[str] = mapped_column(
        String(50),
        default="semantic",
        nullable=False,
        comment="查詢類型"
    )
    
    scope: Mapped[str] = mapped_column(
        String(50),
        default="all",
        nullable=False,
        comment="搜尋範圍"
    )
    
    # 效能指標
    tokens_used: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="使用的 Token 數量"
    )
    
    processing_time: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
        comment="處理時間（秒）"
    )
    
    # 額外資訊
    extra_data: Mapped[dict] = mapped_column(
        JSON,
        nullable=True,
        comment="額外資訊 JSON"
    )
    
    # 外鍵
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="使用者 ID"
    )
    
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="處室 ID"
    )
    
    # 關聯
    user: Mapped["User"] = relationship(
        "User",
        back_populates="query_history"
    )
    
    department: Mapped["Department"] = relationship(
        "Department",
        back_populates="query_history"
    )
    
    def __repr__(self) -> str:
        return f"<QueryHistory(id={self.id}, query='{self.query[:30]}...')>"
