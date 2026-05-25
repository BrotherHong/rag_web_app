"""add reset token to query_users

Revision ID: 20260302_reset_token
Revises: 20260117_ugact
Create Date: 2026-03-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260302_reset_token'
down_revision: Union[str, Sequence[str], None] = '20260117_ugact'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('query_users', sa.Column(
        'reset_password_token',
        sa.String(64),
        nullable=True,
        comment='密碼重設代碼'
    ))
    op.add_column('query_users', sa.Column(
        'reset_token_expires',
        sa.DateTime(),
        nullable=True,
        comment='重設代碼有效期限'
    ))
    op.create_index(
        'ix_query_users_reset_password_token',
        'query_users',
        ['reset_password_token'],
        unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_query_users_reset_password_token', table_name='query_users')
    op.drop_column('query_users', 'reset_token_expires')
    op.drop_column('query_users', 'reset_password_token')
