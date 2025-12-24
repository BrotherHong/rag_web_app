"""檔案模型"""

from typing import List, TYPE_CHECKING
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, Text, Boolean, Enum as SQLEnum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum
from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.department import Department
    from app.models.category import Category
    from app.models.activity import Activity


class FileStatus(str, Enum):
    """檔案處理狀態"""
    PENDING = "pending"      # 待處理
    PROCESSING = "processing"  # 處理中
    COMPLETED = "completed"   # 處理完成
    FAILED = "failed"        # 處理失敗


class File(Base, TimestampMixin):
    """檔案表"""
    
    __tablename__ = "files"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, comment="檔案 ID")
    
    # 檔案基本資料
    filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="儲存的檔案名稱（唯一）"
    )
    
    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="原始檔案名稱"
    )
    
    file_path: Mapped[str] = mapped_column(
        String(500),
        unique=True,
        nullable=False,
        comment="檔案儲存路徑"
    )
    
    file_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="檔案大小 (bytes)"
    )
    
    file_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="檔案類型 (pdf, docx, txt, md)"
    )
    
    mime_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="MIME 類型"
    )
    
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="檔案描述"
    )
    
    # 處理狀態
    status: Mapped[FileStatus] = mapped_column(
        SQLEnum(FileStatus),
        default=FileStatus.PENDING,
        nullable=False,
        index=True,
        comment="檔案處理狀態"
    )
    
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="錯誤訊息"
    )
    
    # 向量化資訊
    is_vectorized: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="是否已向量化"
    )
    
    chunk_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="切分的區塊數量"
    )
    
    vector_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="生成的向量數量"
    )
    
    # 處理進度追蹤
    processing_step: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="當前處理步驟"
    )
    
    processing_progress: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="處理進度 (0-100)"
    )
    
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="處理開始時間"
    )
    
    processing_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="處理完成時間"
    )
    
    # 文件內容摘要
    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="檔案內容摘要"
    )
    
    # 處理後的檔案路徑
    markdown_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="Markdown 轉換後的檔案路徑"
    )
    
    summary_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="摘要 JSON 檔案路徑"
    )
    
    embedding_path: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="嵌入向量 JSON 檔案路徑"
    )
    
    # 外鍵
    uploader_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="上傳者 ID"
    )
    
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所屬處室 ID"
    )
    
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="分類 ID"
    )
    
    # 關聯
    uploader: Mapped["User"] = relationship(
        "User",
        back_populates="uploaded_files"
    )
    
    department: Mapped["Department"] = relationship(
        "Department",
        back_populates="files"
    )
    
    category: Mapped["Category"] = relationship(
        "Category",
        back_populates="files"
    )
    
    activities: Mapped[List["Activity"]] = relationship(
        "Activity",
        back_populates="file"
        # 不使用 cascade，讓資料庫的 SET NULL 外鍵處理
        # 這樣刪除檔案時，活動記錄會保留，只是 file_id 變成 NULL
    )
    
    def __repr__(self) -> str:
        return f"<File(id={self.id}, filename='{self.filename}', status='{self.status}')>"
