"""Make query_history.user_id nullable to allow anonymous queries

Revision ID: 20251217_qh_user_nullable
Revises: 20251230_nullable_dept
Create Date: 2025-12-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251217_qh_user_nullable'
down_revision: Union[str, None] = '20251230_nullable_dept'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow user_id to be NULL so anonymous queries can be stored."""
    op.alter_column(
        'query_history',
        'user_id',
        existing_type=sa.Integer(),
        nullable=True,
        comment='使用者 ID'
    )


def downgrade() -> None:
    """Revert user_id back to NOT NULL; fill NULL with a placeholder user."""
    op.execute("UPDATE query_history SET user_id = 1 WHERE user_id IS NULL")
    op.alter_column(
        'query_history',
        'user_id',
        existing_type=sa.Integer(),
        nullable=False,
        comment='使用者 ID'
    )