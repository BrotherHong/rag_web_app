"""add_category_activity_types

Revision ID: 165ed8fc21fe
Revises: 20251113_add_dept
Create Date: 2025-11-18 15:32:30.782468

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '165ed8fc21fe'
down_revision: Union[str, Sequence[str], None] = '20251113_add_dept'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 添加新的 enum 值到 activitytype
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'create_category'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'update_category'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'delete_category'")


def downgrade() -> None:
    """Downgrade schema."""
    # PostgreSQL 不支援刪除 enum 值，所以 downgrade 不做任何事
    pass
