"""add user groups and file user group permissions

Revision ID: 20260117_add_user_groups
Revises: 1d60b64d31cc
Create Date: 2026-01-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260117_add_user_groups'
down_revision = '1d60b64d31cc'
branch_labels = None
depends_on = None


def upgrade():
    # 創建 user_groups 表
    op.create_table(
        'user_groups',
        sa.Column('id', sa.Integer(), nullable=False, comment='身分組 ID'),
        sa.Column('department_id', sa.Integer(), nullable=False, comment='所屬處室 ID'),
        sa.Column('name', sa.String(length=100), nullable=False, comment='身分組名稱'),
        sa.Column('description', sa.Text(), nullable=True, comment='身分組描述'),
        sa.Column('priority', sa.Integer(), nullable=False, comment='優先級（數字越小權限越高）'),
        sa.Column('color', sa.String(length=20), nullable=False, comment='顏色標識'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment='用戶身分組表'
    )
    op.create_index(op.f('ix_user_groups_department_id'), 'user_groups', ['department_id'], unique=False)
    
    # 創建 query_user_groups 多對多關聯表
    op.create_table(
        'query_user_groups',
        sa.Column('query_user_id', sa.Integer(), nullable=False),
        sa.Column('user_group_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['query_user_id'], ['query_users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_group_id'], ['user_groups.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('query_user_id', 'user_group_id'),
        comment='查詢用戶與身分組的關聯表'
    )
    
    # 創建 file_user_group_permissions 表
    op.create_table(
        'file_user_group_permissions',
        sa.Column('id', sa.Integer(), nullable=False, comment='權限 ID'),
        sa.Column('file_id', sa.Integer(), nullable=False, comment='檔案 ID'),
        sa.Column('user_group_id', sa.Integer(), nullable=False, comment='身分組 ID'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_group_id'], ['user_groups.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment='檔案與身分組權限表'
    )
    op.create_index(op.f('ix_file_user_group_permissions_file_id'), 'file_user_group_permissions', ['file_id'], unique=False)
    op.create_index(op.f('ix_file_user_group_permissions_user_group_id'), 'file_user_group_permissions', ['user_group_id'], unique=False)


def downgrade():
    # 刪除表（按相反順序）
    op.drop_index(op.f('ix_file_user_group_permissions_user_group_id'), table_name='file_user_group_permissions')
    op.drop_index(op.f('ix_file_user_group_permissions_file_id'), table_name='file_user_group_permissions')
    op.drop_table('file_user_group_permissions')
    
    op.drop_table('query_user_groups')
    
    op.drop_index(op.f('ix_user_groups_department_id'), table_name='user_groups')
    op.drop_table('user_groups')
