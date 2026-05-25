"""add assistant settings to departments

Revision ID: 20260424_add_assistant_settings
Revises: 20260422_add_admin_groups
Create Date: 2026-04-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260424_add_assistant_settings'
down_revision: Union[str, None] = '20260422_add_admin_groups'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('departments', sa.Column('assistant_name', sa.String(100), nullable=True, comment='自訂助手名稱'))
    op.add_column('departments', sa.Column('greeting_message', sa.Text(), nullable=True, comment='自訂問候語'))
    op.add_column('departments', sa.Column('greeting_image', sa.String(500), nullable=True, comment='問候語圖片路徑'))
    op.add_column('departments', sa.Column('enable_direct_query', sa.Boolean(), nullable=False, server_default=sa.text('true'), comment='是否啟用 AI 通用知識回答功能'))


def downgrade() -> None:
    op.drop_column('departments', 'enable_direct_query')
    op.drop_column('departments', 'greeting_image')
    op.drop_column('departments', 'greeting_message')
    op.drop_column('departments', 'assistant_name')
