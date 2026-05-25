"""上傳批次與任務項目模型"""

from datetime import datetime
from enum import Enum
from typing import Optional, TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.file import File
    from app.models.user import User


class UploadBatchStatus(str, Enum):
    """批次任務狀態"""

    QUEUED = "queued"
    PROCESSING = "processing"
    PARTIAL = "partial"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class UploadBatchItemStatus(str, Enum):
    """單檔任務狀態"""

    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class UploadBatch(Base, TimestampMixin):
    """上傳批次任務"""

    __tablename__ = "upload_batches"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        comment="批次任務 UUID"
    )

    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="所屬處室 ID"
    )

    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="建立批次的使用者 ID"
    )

    status: Mapped[UploadBatchStatus] = mapped_column(
        SQLEnum(UploadBatchStatus),
        default=UploadBatchStatus.QUEUED,
        nullable=False,
        index=True,
        comment="批次狀態"
    )

    total_files: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="批次檔案總數"
    )

    processed_files: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="已處理檔案數"
    )

    success_files: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="成功檔案數"
    )

    failed_files: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="失敗檔案數"
    )

    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="批次完成時間"
    )

    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="批次錯誤訊息"
    )

    creator: Mapped["User"] = relationship("User")
    department: Mapped["Department"] = relationship("Department")
    items: Mapped[list["UploadBatchItem"]] = relationship(
        "UploadBatchItem",
        back_populates="batch",
        cascade="all, delete-orphan"
    )


class UploadBatchItem(Base, TimestampMixin):
    """批次中的單檔任務"""

    __tablename__ = "upload_batch_items"

    id: Mapped[int] = mapped_column(primary_key=True)

    batch_id: Mapped[str] = mapped_column(
        ForeignKey("upload_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="批次任務 UUID"
    )

    file_id: Mapped[int] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="檔案 ID"
    )

    celery_task_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        comment="Celery 任務 ID"
    )

    status: Mapped[UploadBatchItemStatus] = mapped_column(
        SQLEnum(UploadBatchItemStatus),
        default=UploadBatchItemStatus.QUEUED,
        nullable=False,
        index=True,
        comment="單檔任務狀態"
    )

    processing_step: Mapped[Optional[str]] = mapped_column(
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

    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="任務開始時間"
    )

    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="任務完成時間"
    )

    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="錯誤訊息"
    )

    batch: Mapped["UploadBatch"] = relationship("UploadBatch", back_populates="items")
    file: Mapped["File"] = relationship("File")
