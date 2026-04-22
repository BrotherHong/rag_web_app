"""管理組織模型"""

from typing import List, TYPE_CHECKING
from sqlalchemy import String, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.user import User
    from app.models.file import File


class AdminGroup(Base, TimestampMixin):
    """管理組織表
    
    用於處室內多位管理員的分工，控制各管理員能操作的檔案範圍。
    與查詢用戶的身分組（UserGroup）完全獨立。
    """

    __tablename__ = "admin_groups"

    id: Mapped[int] = mapped_column(primary_key=True, comment="管理組織 ID")

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="組織名稱"
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="組織描述"
    )

    color: Mapped[str] = mapped_column(
        String(20),
        default="#3B82F6",
        nullable=False,
        comment="顏色標識（UI 顯示用）"
    )

    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所屬處室 ID"
    )

    # 關聯
    department: Mapped["Department"] = relationship(
        "Department",
        back_populates="admin_groups"
    )

    users: Mapped[List["User"]] = relationship(
        "User",
        back_populates="admin_group",
        foreign_keys="User.admin_group_id"
    )

    files: Mapped[List["File"]] = relationship(
        "File",
        back_populates="admin_group",
        foreign_keys="File.admin_group_id"
    )

    __table_args__ = (
        {"comment": "管理組織表"},
    )

    def __repr__(self) -> str:
        return f"<AdminGroup(id={self.id}, name='{self.name}', dept={self.department_id})>"
