"""add_department_activity_types

Revision ID: 006c05f62ec4
Revises: 20251230_nullable_dept
Create Date: 2025-11-18 18:09:59.937668

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '006c05f62ec4'
down_revision: Union[str, Sequence[str], None] = '20251230_nullable_dept'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 為 PostgreSQL enum 添加新的活動類型
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'CREATE_DEPARTMENT'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'UPDATE_DEPARTMENT'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'DELETE_DEPARTMENT'")


def downgrade() -> None:
    """Downgrade schema."""
    # PostgreSQL 不支援移除 enum 值，需要重建整個 enum
    # 為了安全起見，這裡不實作 downgrade
    pass
