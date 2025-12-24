"""add_setting_activity_types

Revision ID: 6466c19c269e
Revises: cfee6b65575c
Create Date: 2025-11-19 15:07:45.940677

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6466c19c269e'
down_revision: Union[str, Sequence[str], None] = 'cfee6b65575c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 為 PostgreSQL enum 添加系統設定相關的活動類型
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'CREATE_SETTING'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'UPDATE_SETTING'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'DELETE_SETTING'")


def downgrade() -> None:
    """Downgrade schema."""
    # PostgreSQL 不支援移除 enum 值，需要重建整個 enum
    # 為了安全起見，這裡不實作 downgrade
    pass
