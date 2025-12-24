"""add_color_to_departments

Revision ID: a7d6ac741c7e
Revises: 6466c19c269e
Create Date: 2025-11-19 20:11:00.558558

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7d6ac741c7e'
down_revision: Union[str, Sequence[str], None] = '6466c19c269e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 添加 color 欄位到 departments 表
    op.add_column('departments', sa.Column('color', sa.String(length=20), nullable=False, server_default='#3B82F6', comment='處室顏色'))


def downgrade() -> None:
    """Downgrade schema."""
    # 移除 color 欄位
    op.drop_column('departments', 'color')
