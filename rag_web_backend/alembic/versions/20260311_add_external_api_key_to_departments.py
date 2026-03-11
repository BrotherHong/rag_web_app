"""add external_api_key to departments

Revision ID: 20260311_add_external_api_key
Revises: 20260304_add_default_user_groups
Create Date: 2026-03-11

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '20260311_add_external_api_key'
down_revision = '20260305_add_query_user_id'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'departments',
        sa.Column('external_api_key', sa.String(500), nullable=True, comment='外部 LLM API Key（選填）')
    )


def downgrade():
    op.drop_column('departments', 'external_api_key')
