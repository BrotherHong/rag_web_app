"""使用者模型"""

from typing import List, TYPE_CHECKING
from sqlalchemy import String, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum
from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.file import File
    from app.models.activity import Activity
    from app.models.query_history import QueryHistory


class UserRole(str, Enum):
    """使用者角色"""
    SUPER_ADMIN = "SUPER_ADMIN"  # 系統管理員（最高權限）
    ADMIN = "ADMIN"              # 處室管理員
    USER = "USER"                # 一般使用者


class User(Base, TimestampMixin):
    """使用者表"""
    
    __tablename__ = "users"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="使用者 ID")
    
    # 基本資料
    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
        comment="使用者名稱"
    )
    
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
        comment="電子郵件"
    )
    
    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="密碼雜湊值"
    )
    
    full_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="全名"
    )
    
    # 權限與狀態
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole),
        default=UserRole.USER,
        nullable=False,
        comment="使用者角色"
    )
    
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="帳號是否啟用"
    )
    
    # 外鍵
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="所屬處室 ID（super_admin 可為 NULL）"
    )
    
    # 關聯
    department: Mapped["Department"] = relationship(
        "Department",
        back_populates="users"
    )
    
    uploaded_files: Mapped[List["File"]] = relationship(
        "File",
        back_populates="uploader",
        cascade="all, delete-orphan"
    )
    
    activities: Mapped[List["Activity"]] = relationship(
        "Activity",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    
    query_history: Mapped[List["QueryHistory"]] = relationship(
        "QueryHistory",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, username='{self.username}', role='{self.role}')>"
