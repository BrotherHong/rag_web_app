"""Make department_id nullable for super_admin users

Revision ID: 20251230_nullable_dept
Revises: 165ed8fc21fe
Create Date: 2025-12-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251230_nullable_dept'
down_revision: Union[str, None] = '165ed8fc21fe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow department_id to be NULL for super_admin users."""
    # 修改 department_id 欄位為可 NULL
    op.alter_column(
        'users',
        'department_id',
        existing_type=sa.Integer(),
        nullable=True,
        comment='所屬處室 ID（super_admin 可為 NULL）'
    )
    
    # 注意: 在乾淨資料庫中不需要執行 UPDATE，因為還沒有用戶資料
    # 如果有現有用戶資料，init_db.py 腳本會正確處理


def downgrade() -> None:
    """Revert department_id back to NOT NULL."""
    # 先將 NULL 值設為預設處室（假設 ID 1 存在）
    op.execute(
        "UPDATE users SET department_id = 1 WHERE department_id IS NULL"
    )
    
    # 恢復 NOT NULL 約束
    op.alter_column(
        'users',
        'department_id',
        existing_type=sa.Integer(),
        nullable=False,
        comment='所屬處室 ID'
    )
