"""add login_methods to departments

Revision ID: 20260326_add_department_login_methods
Revises: 20260311_add_external_api_key
Create Date: 2026-03-26

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '20260326_add_department_login_methods'
down_revision = '20260311_add_external_api_key'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'departments',
        sa.Column(
            'login_methods',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[\"normal\",\"success_portal\"]'::json"),
            comment='啟用的登入方式（normal, success_portal, google）'
        )
    )


def downgrade() -> None:
    op.drop_column('departments', 'login_methods')
