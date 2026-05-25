"""add user group activity types

Revision ID: 20260117_ugact
Revises: 20260117_add_user_groups
Create Date: 2026-01-17 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260117_ugact'
down_revision = '20260117_add_user_groups'
branch_labels = None
depends_on = None


def upgrade():
    # 在 PostgreSQL 中添加新的枚舉值到 activitytype
    # 注意：PostgreSQL 的 ENUM 類型需要使用 ALTER TYPE 來添加新值
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'CREATE_USER_GROUP'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'UPDATE_USER_GROUP'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'DELETE_USER_GROUP'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'USER_GROUP_ADD_MEMBER'")
    op.execute("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'USER_GROUP_REMOVE_MEMBER'")


def downgrade():
    # PostgreSQL 不支持直接刪除 ENUM 值
    # 如果需要回滾，需要重新創建整個 ENUM 類型
    pass
