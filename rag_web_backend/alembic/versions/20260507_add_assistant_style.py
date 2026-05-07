"""add assistant_style to departments

Revision ID: 20260507_add_assistant_style
Revises: 20260507_drop_organization_from_query_users
Create Date: 2026-05-07

"""
from alembic import op
import sqlalchemy as sa

revision = '20260507_add_assistant_style'
down_revision = '20260507_drop_organization_from_query_users'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('departments', sa.Column('assistant_style', sa.Text(), nullable=True, comment='助手回答風格描述'))


def downgrade():
    op.drop_column('departments', 'assistant_style')
