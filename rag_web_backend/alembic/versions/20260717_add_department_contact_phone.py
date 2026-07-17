"""add department contact phone

Revision ID: 20260717_add_contact_phone
Revises: 20260704_add_assistant_avatar
Create Date: 2026-07-17

"""
from alembic import op
import sqlalchemy as sa


revision = "20260717_add_contact_phone"
down_revision = "20260704_add_assistant_avatar"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "departments",
        sa.Column("contact_phone", sa.String(50), nullable=True, comment="查詢首頁顯示電話"),
    )


def downgrade():
    op.drop_column("departments", "contact_phone")
