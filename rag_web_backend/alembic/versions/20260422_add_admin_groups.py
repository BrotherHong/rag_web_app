"""add admin groups

Revision ID: 20260422_add_admin_groups
Revises: 20260401_merge_heads_department_login_and_upload_batch
Create Date: 2026-04-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20260422_add_admin_groups'
down_revision: Union[str, Sequence[str], None] = '20260401_merge_heads_department_login_and_upload_batch'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 建立 admin_groups 資料表
    op.create_table(
        'admin_groups',
        sa.Column('id', sa.Integer(), nullable=False, comment='管理組織 ID'),
        sa.Column('name', sa.String(100), nullable=False, comment='組織名稱'),
        sa.Column('description', sa.Text(), nullable=True, comment='組織描述'),
        sa.Column('color', sa.String(20), nullable=False, server_default='#3B82F6', comment='顏色標識'),
        sa.Column('department_id', sa.Integer(), nullable=False, comment='所屬處室 ID'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment='管理組織表'
    )
    op.create_index('ix_admin_groups_department_id', 'admin_groups', ['department_id'])

    # 2. 在 users 表加入 admin_group_id
    op.add_column('users', sa.Column(
        'admin_group_id', sa.Integer(), nullable=True,
        comment='所屬管理組織 ID（選填）'
    ))
    op.create_foreign_key(
        'fk_users_admin_group_id',
        'users', 'admin_groups',
        ['admin_group_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_users_admin_group_id', 'users', ['admin_group_id'])

    # 3. 在 files 表加入 admin_group_id
    op.add_column('files', sa.Column(
        'admin_group_id', sa.Integer(), nullable=True,
        comment='所屬管理組織 ID（上傳時自動帶入）'
    ))
    op.create_foreign_key(
        'fk_files_admin_group_id',
        'files', 'admin_groups',
        ['admin_group_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_files_admin_group_id', 'files', ['admin_group_id'])


def downgrade() -> None:
    op.drop_index('ix_files_admin_group_id', 'files')
    op.drop_constraint('fk_files_admin_group_id', 'files', type_='foreignkey')
    op.drop_column('files', 'admin_group_id')

    op.drop_index('ix_users_admin_group_id', 'users')
    op.drop_constraint('fk_users_admin_group_id', 'users', type_='foreignkey')
    op.drop_column('users', 'admin_group_id')

    op.drop_index('ix_admin_groups_department_id', 'admin_groups')
    op.drop_table('admin_groups')
