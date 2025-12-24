"""add_super_admin_to_userrole_enum

Revision ID: 1e1e10457f8f
Revises: f7112845d48f
Create Date: 2025-11-19 20:13:11.102399

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1e1e10457f8f'
down_revision: Union[str, Sequence[str], None] = 'f7112845d48f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 新增 SUPER_ADMIN 值到 userrole 枚舉類型
    op.execute("ALTER TYPE userrole ADD VALUE 'SUPER_ADMIN'")


def downgrade() -> None:
    """Downgrade schema."""
    # PostgreSQL 不支援直接刪除枚舉值，需要重建整個類型
    # 這裡跳過向下遷移，因為很少會需要
    pass
