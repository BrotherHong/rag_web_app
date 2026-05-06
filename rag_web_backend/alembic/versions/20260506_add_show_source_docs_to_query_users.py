"""add show_source_docs to query_users

Revision ID: 20260506_add_show_source_docs
Revises: 20260424_add_assistant_settings
Create Date: 2026-05-06

"""
from alembic import op
import sqlalchemy as sa

revision = '20260506_add_show_source_docs'
down_revision = '20260424_add_assistant_settings'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'query_users',
        sa.Column('show_source_docs', sa.Boolean(), nullable=False, server_default=sa.true())
    )


def downgrade():
    op.drop_column('query_users', 'show_source_docs')
