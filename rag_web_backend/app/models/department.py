"""處室模型"""

from typing import List, TYPE_CHECKING
from sqlalchemy import String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.file import File
    from app.models.query_history import QueryHistory
    from app.models.category import Category
    from app.models.activity import Activity
    from app.models.user_group import UserGroup
    from app.models.admin_group import AdminGroup


class Department(Base, TimestampMixin):
    """處室表"""
    
    __tablename__ = "departments"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="處室 ID")
    
    # 基本資料
    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
        comment="處室名稱"
    )
    
    slug: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
        comment="URL 友善識別碼"
    )
    
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="處室描述"
    )
    
    color: Mapped[str] = mapped_column(
        String(20),
        default="blue",
        nullable=False,
        comment="處室顏色"
    )

    external_api_key: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="外部 LLM API Key（選填）"
    )

    login_methods: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: ["normal", "success_portal"],
        comment="啟用的登入方式（normal, success_portal, google）"
    )

    # 助手設定
    assistant_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="自訂助手名稱"
    )

    greeting_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="自訂問候語"
    )

    greeting_image: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="問候語圖片路徑"
    )

    assistant_style: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="助手回答風格描述"
    )

    enable_direct_query: Mapped[bool] = mapped_column(
        default=True,
        nullable=False,
        comment="是否啟用「改以 AI 通用知識回答」功能"
    )

    # 關聯
    users: Mapped[List["User"]] = relationship(
        "User",
        back_populates="department",
        cascade="all, delete-orphan"
    )
    
    files: Mapped[List["File"]] = relationship(
        "File",
        back_populates="department",
        cascade="all, delete-orphan"
    )
    
    categories: Mapped[List["Category"]] = relationship(
        "Category",
        back_populates="department",
        cascade="all, delete-orphan"
    )
    
    query_history: Mapped[List["QueryHistory"]] = relationship(
        "QueryHistory",
        back_populates="department",
        cascade="all, delete-orphan"
    )
    
    activities: Mapped[List["Activity"]] = relationship(
        "Activity",
        back_populates="department",
        cascade="all, delete-orphan"
    )
    
    user_groups: Mapped[List["UserGroup"]] = relationship(
        "UserGroup",
        back_populates="department",
        cascade="all, delete-orphan"
    )

    admin_groups: Mapped[List["AdminGroup"]] = relationship(
        "AdminGroup",
        back_populates="department",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Department(id={self.id}, name='{self.name}')>"

    @property
    def has_external_api_key(self) -> bool:
        return bool(self.external_api_key)
