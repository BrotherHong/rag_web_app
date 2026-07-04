"""add assistant avatar settings

Revision ID: 20260704_add_assistant_avatar
Revises: 20260507_add_assistant_style
Create Date: 2026-07-04

"""
from alembic import op
import sqlalchemy as sa


revision = "20260704_add_assistant_avatar"
down_revision = "20260507_add_assistant_style"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "departments",
        sa.Column("assistant_avatar", sa.String(500), nullable=True, comment="固定助手頭貼路徑"),
    )
    op.add_column(
        "departments",
        sa.Column(
            "assistant_avatar_mode",
            sa.String(20),
            nullable=False,
            server_default="fixed",
            comment="助手頭貼模式（fixed/random）",
        ),
    )


def downgrade():
    op.drop_column("departments", "assistant_avatar_mode")
    op.drop_column("departments", "assistant_avatar")
