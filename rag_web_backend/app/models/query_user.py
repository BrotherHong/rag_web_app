"""查詢用戶模型（前端查詢系統專用）"""

from typing import List, TYPE_CHECKING, Optional
from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey, Text, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum
from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.user import User
    from app.models.file import File


class QueryUserStatus(str, Enum):
    """查詢用戶狀態"""
    PENDING = "pending"      # 待審批
    APPROVED = "approved"    # 已審批
    REJECTED = "rejected"    # 已拒絕
    SUSPENDED = "suspended"  # 已停用


class QueryUser(Base, TimestampMixin):
    """查詢用戶表（用於前端查詢系統）
    
    與後台管理的 User 模型完全獨立，專門用於前端查詢系統的用戶管理
    """
    
    __tablename__ = "query_users"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="查詢用戶 ID")
    
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
    
    # 申請資料
    application_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="申請理由"
    )
    
    organization: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="所屬單位/組織"
    )
    
    # 狀態與權限
    status: Mapped[QueryUserStatus] = mapped_column(
        String(20),
        default=QueryUserStatus.PENDING,
        nullable=False,
        comment="用戶狀態"
    )
    
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="帳號是否啟用"
    )
    
    # 審批資料
    approved_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="審批人 ID（後台管理員）"
    )
    
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="審批時間"
    )
    
    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="拒絕理由"
    )
    
    # 預設可見處室
    default_department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="預設可見處室 ID"
    )
    
    # 備註
    admin_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="管理員備註"
    )
    
    # 關聯
    approver: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[approved_by]
    )
    
    default_department: Mapped[Optional["Department"]] = relationship(
        "Department",
        foreign_keys=[default_department_id]
    )
    
    file_permissions: Mapped[List["FilePermission"]] = relationship(
        "FilePermission",
        back_populates="query_user",
        cascade="all, delete-orphan"
    )


class FilePermission(Base, TimestampMixin):
    """文件權限表（控制查詢用戶對文件的訪問權限）"""
    
    __tablename__ = "file_permissions"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="權限 ID")
    
    # 關聯
    query_user_id: Mapped[int] = mapped_column(
        ForeignKey("query_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="查詢用戶 ID"
    )
    
    file_id: Mapped[int] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="文件 ID"
    )
    
    # 授權資料
    granted_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="授權人 ID（後台管理員）"
    )
    
    granted_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        comment="授權時間"
    )
    
    # 備註
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="權限備註"
    )
    
    # 關聯
    query_user: Mapped["QueryUser"] = relationship(
        "QueryUser",
        back_populates="file_permissions"
    )
    
    file: Mapped["File"] = relationship(
        "File",
        back_populates="query_user_permissions"
    )
    
    granter: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[granted_by]
    )
    
    # 唯一約束：一個用戶對一個文件只能有一個權限記錄
    __table_args__ = (
        {"comment": "查詢用戶文件訪問權限表"}
    ,)
