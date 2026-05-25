"""add upload batch tracking tables

Revision ID: 20260326_add_upload_batch_tables
Revises: 20260311_add_external_api_key
Create Date: 2026-03-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260326_add_upload_batch_tables"
down_revision = "20260311_add_external_api_key"
branch_labels = None
depends_on = None


upload_batch_status = postgresql.ENUM(
    "QUEUED",
    "PROCESSING",
    "PARTIAL",
    "COMPLETED",
    "FAILED",
    "CANCELED",
    name="uploadbatchstatus",
    create_type=False,
)

upload_batch_item_status = postgresql.ENUM(
    "QUEUED",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "CANCELED",
    name="uploadbatchitemstatus",
    create_type=False,
)


def upgrade() -> None:
    upload_batch_status.create(op.get_bind(), checkfirst=True)
    upload_batch_item_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "upload_batches",
        sa.Column("id", sa.String(length=36), nullable=False, comment="批次任務 UUID"),
        sa.Column("department_id", sa.Integer(), nullable=False, comment="所屬處室 ID"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False, comment="建立批次的使用者 ID"),
        sa.Column("status", upload_batch_status, nullable=False, comment="批次狀態"),
        sa.Column("total_files", sa.Integer(), nullable=False, server_default="0", comment="批次檔案總數"),
        sa.Column("processed_files", sa.Integer(), nullable=False, server_default="0", comment="已處理檔案數"),
        sa.Column("success_files", sa.Integer(), nullable=False, server_default="0", comment="成功檔案數"),
        sa.Column("failed_files", sa.Integer(), nullable=False, server_default="0", comment="失敗檔案數"),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True, comment="批次完成時間"),
        sa.Column("error_message", sa.Text(), nullable=True, comment="批次錯誤訊息"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_upload_batches_created_by_user_id"), "upload_batches", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_upload_batches_department_id"), "upload_batches", ["department_id"], unique=False)
    op.create_index(op.f("ix_upload_batches_status"), "upload_batches", ["status"], unique=False)

    op.create_table(
        "upload_batch_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.String(length=36), nullable=False, comment="批次任務 UUID"),
        sa.Column("file_id", sa.Integer(), nullable=False, comment="檔案 ID"),
        sa.Column("celery_task_id", sa.String(length=100), nullable=True, comment="Celery 任務 ID"),
        sa.Column("status", upload_batch_item_status, nullable=False, comment="單檔任務狀態"),
        sa.Column("processing_step", sa.String(length=50), nullable=True, comment="當前處理步驟"),
        sa.Column("processing_progress", sa.Integer(), nullable=False, server_default="0", comment="處理進度 (0-100)"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True, comment="任務開始時間"),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True, comment="任務完成時間"),
        sa.Column("error_message", sa.Text(), nullable=True, comment="錯誤訊息"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["upload_batches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_upload_batch_items_batch_id"), "upload_batch_items", ["batch_id"], unique=False)
    op.create_index(op.f("ix_upload_batch_items_celery_task_id"), "upload_batch_items", ["celery_task_id"], unique=False)
    op.create_index(op.f("ix_upload_batch_items_file_id"), "upload_batch_items", ["file_id"], unique=False)
    op.create_index(op.f("ix_upload_batch_items_status"), "upload_batch_items", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_upload_batch_items_status"), table_name="upload_batch_items")
    op.drop_index(op.f("ix_upload_batch_items_file_id"), table_name="upload_batch_items")
    op.drop_index(op.f("ix_upload_batch_items_celery_task_id"), table_name="upload_batch_items")
    op.drop_index(op.f("ix_upload_batch_items_batch_id"), table_name="upload_batch_items")
    op.drop_table("upload_batch_items")

    op.drop_index(op.f("ix_upload_batches_status"), table_name="upload_batches")
    op.drop_index(op.f("ix_upload_batches_department_id"), table_name="upload_batches")
    op.drop_index(op.f("ix_upload_batches_created_by_user_id"), table_name="upload_batches")
    op.drop_table("upload_batches")

    upload_batch_item_status.drop(op.get_bind(), checkfirst=True)
    upload_batch_status.drop(op.get_bind(), checkfirst=True)
