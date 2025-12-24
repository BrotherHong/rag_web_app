"""remove_unique_constraint_from_categories_name

Revision ID: f7112845d48f
Revises: a7d6ac741c7e
Create Date: 2025-11-19 20:12:29.674060

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7112845d48f'
down_revision: Union[str, Sequence[str], None] = 'a7d6ac741c7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 移除 categories name 的 unique 約束，允許不同處室有同名分類
    op.drop_index('ix_categories_name', table_name='categories')
    # 建立非唯一索引以保持查詢效能
    op.create_index('ix_categories_name', 'categories', ['name'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # 恢復唯一約束
    op.drop_index('ix_categories_name', table_name='categories')
    op.create_index('ix_categories_name', 'categories', ['name'], unique=True)
