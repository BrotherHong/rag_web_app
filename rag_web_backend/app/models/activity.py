"""活動記錄模型"""

from typing import TYPE_CHECKING
from sqlalchemy import String, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum
from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.file import File
    from app.models.department import Department


class ActivityType(str, Enum):
    """活動類型"""
    LOGIN = "LOGIN"                # 登入
    LOGOUT = "LOGOUT"              # 登出
    UPLOAD = "UPLOAD"              # 上傳檔案
    DOWNLOAD = "DOWNLOAD"          # 下載檔案
    DELETE = "DELETE"              # 刪除檔案
    SEARCH = "SEARCH"              # 搜尋
    QUERY = "QUERY"                # RAG 查詢
    UPDATE_PROFILE = "UPDATE_PROFILE"  # 更新個人資料
    UPDATE_FILE = "UPDATE_FILE"    # 更新檔案資訊
    CREATE_USER = "CREATE_USER"    # 建立使用者
    UPDATE_USER = "UPDATE_USER"    # 更新使用者
    DELETE_USER = "DELETE_USER"    # 刪除使用者
    CREATE_DEPARTMENT = "CREATE_DEPARTMENT"  # 建立處室
    UPDATE_DEPARTMENT = "UPDATE_DEPARTMENT"  # 更新處室
    DELETE_DEPARTMENT = "DELETE_DEPARTMENT"  # 刪除處室
    CREATE_CATEGORY = "CREATE_CATEGORY"  # 建立分類
    UPDATE_CATEGORY = "UPDATE_CATEGORY"  # 更新分類
    DELETE_CATEGORY = "DELETE_CATEGORY"  # 刪除分類
    CREATE_SETTING = "CREATE_SETTING"  # 建立系統設定
    UPDATE_SETTING = "UPDATE_SETTING"  # 更新系統設定
    DELETE_SETTING = "DELETE_SETTING"  # 刪除系統設定


class Activity(Base, TimestampMixin):
    """活動記錄表"""
    
    __tablename__ = "activities"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="活動 ID")
    
    # 活動資訊
    activity_type: Mapped[ActivityType] = mapped_column(
        SQLEnum(ActivityType),
        nullable=False,
        index=True,
        comment="活動類型"
    )
    
    description: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        comment="活動描述"
    )
    
    ip_address: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="IP 位址"
    )
    
    user_agent: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="User Agent"
    )
    
    extra_data: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="額外資訊 (JSON 格式)"
    )
    
    # 外鍵
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="使用者 ID (實際操作者)"
    )
    
    file_id: Mapped[int | None] = mapped_column(
        ForeignKey("files.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="關聯檔案 ID"
    )
    
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="關聯處室 ID (活動發生的處室,用於代理模式)"
    )
    
    # 關聯
    user: Mapped["User"] = relationship(
        "User",
        back_populates="activities"
    )
    
    file: Mapped["File"] = relationship(
        "File",
        back_populates="activities"
    )
    
    department: Mapped["Department"] = relationship(
        "Department",
        back_populates="activities"
    )
    
    def __repr__(self) -> str:
        return f"<Activity(id={self.id}, type='{self.activity_type}', user_id={self.user_id})>"
