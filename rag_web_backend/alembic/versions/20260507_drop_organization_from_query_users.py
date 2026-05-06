"""drop organization from query_users

Revision ID: 20260507_drop_organization_from_query_users
Revises: 20260506_add_show_source_docs
Create Date: 2026-05-07

"""
from alembic import op
import sqlalchemy as sa

revision = '20260507_drop_organization_from_query_users'
down_revision = '20260506_add_show_source_docs'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('query_users', 'organization')


def downgrade():
    op.add_column(
        'query_users',
        sa.Column('organization', sa.String(length=200), nullable=True, comment='所屬單位/組織')
    )
