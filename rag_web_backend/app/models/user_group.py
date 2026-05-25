"""用戶身分組模型"""

from typing import List, TYPE_CHECKING, Optional
from sqlalchemy import String, ForeignKey, Integer, Text, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.query_user import QueryUser
    from app.models.file import File


# 查詢用戶與身分組的多對多關聯表
query_user_groups = Table(
    'query_user_groups',
    Base.metadata,
    Column('query_user_id', Integer, ForeignKey('query_users.id', ondelete='CASCADE'), primary_key=True),
    Column('user_group_id', Integer, ForeignKey('user_groups.id', ondelete='CASCADE'), primary_key=True),
    comment='查詢用戶與身分組的關聯表'
)


class UserGroup(Base, TimestampMixin):
    """用戶身分組表
    
    用於管理各處室的層級身分組，例如：
    - 主管
    - 組A
    - 組B
    - 組C
    
    每個身分組有不同的權限層級，可以設定哪些檔案對哪些身分組可見
    """
    
    __tablename__ = "user_groups"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="身分組 ID")
    
    # 所屬處室
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所屬處室 ID"
    )
    
    # 身分組資訊
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="身分組名稱"
    )
    
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="身分組描述"
    )
    
    # 優先級（數字越小權限越高，0 為最高權限）
    priority: Mapped[int] = mapped_column(
        Integer,
        default=100,
        nullable=False,
        comment="優先級（數字越小權限越高）"
    )
    
    # 顏色標識（用於 UI 顯示）
    color: Mapped[str] = mapped_column(
        String(20),
        default="#3B82F6",
        nullable=False,
        comment="顏色標識"
    )
    
    # 關聯
    department: Mapped["Department"] = relationship(
        "Department",
        back_populates="user_groups"
    )
    
    # 多對多：此身分組包含的查詢用戶
    query_users: Mapped[List["QueryUser"]] = relationship(
        "QueryUser",
        secondary=query_user_groups,
        back_populates="user_groups"
    )
    
    # 一對多：此身分組可訪問的檔案權限
    file_permissions: Mapped[List["FileUserGroupPermission"]] = relationship(
        "FileUserGroupPermission",
        back_populates="user_group",
        cascade="all, delete-orphan"
    )
    
    __table_args__ = (
        {"comment": "用戶身分組表"}
    ,)


class FileUserGroupPermission(Base, TimestampMixin):
    """檔案與身分組權限表
    
    控制哪些身分組可以訪問哪些檔案
    """
    
    __tablename__ = "file_user_group_permissions"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="權限 ID")
    
    # 關聯
    file_id: Mapped[int] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="檔案 ID"
    )
    
    user_group_id: Mapped[int] = mapped_column(
        ForeignKey("user_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="身分組 ID"
    )
    
    # 關聯
    file: Mapped["File"] = relationship(
        "File",
        back_populates="user_group_permissions"
    )
    
    user_group: Mapped["UserGroup"] = relationship(
        "UserGroup",
        back_populates="file_permissions"
    )
    
    __table_args__ = (
        {"comment": "檔案與身分組權限表"}
    ,)
