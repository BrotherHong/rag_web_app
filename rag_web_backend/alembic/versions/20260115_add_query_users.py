"""add query users and file permissions tables

Revision ID: 20260115_add_query_users
Revises: 20251224_add_slug
Create Date: 2026-01-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260115_add_query_users'
down_revision = '20251224_add_slug'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 創建 query_users 表
    op.create_table(
        'query_users',
        sa.Column('id', sa.Integer(), nullable=False, comment='查詢用戶 ID'),
        sa.Column('username', sa.String(length=50), nullable=False, comment='使用者名稱'),
        sa.Column('email', sa.String(length=255), nullable=False, comment='電子郵件'),
        sa.Column('hashed_password', sa.String(length=255), nullable=False, comment='密碼雜湊值'),
        sa.Column('full_name', sa.String(length=100), nullable=False, comment='全名'),
        sa.Column('application_reason', sa.Text(), nullable=True, comment='申請理由'),
        sa.Column('organization', sa.String(length=200), nullable=True, comment='所屬單位/組織'),
        sa.Column('status', sa.String(length=20), nullable=False, comment='用戶狀態'),
        sa.Column('is_active', sa.Boolean(), nullable=False, comment='帳號是否啟用'),
        sa.Column('approved_by', sa.Integer(), nullable=True, comment='審批人 ID（後台管理員）'),
        sa.Column('approved_at', sa.DateTime(), nullable=True, comment='審批時間'),
        sa.Column('rejection_reason', sa.Text(), nullable=True, comment='拒絕理由'),
        sa.Column('default_department_id', sa.Integer(), nullable=True, comment='預設可見處室 ID'),
        sa.Column('max_queries_per_day', sa.Integer(), nullable=True, comment='每日查詢次數限制（NULL 表示不限制）'),
        sa.Column('admin_notes', sa.Text(), nullable=True, comment='管理員備註'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['default_department_id'], ['departments.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        comment='查詢用戶表（用於前端查詢系統）'
    )
    
    # 創建索引
    op.create_index(op.f('ix_query_users_username'), 'query_users', ['username'], unique=True)
    op.create_index(op.f('ix_query_users_email'), 'query_users', ['email'], unique=True)
    op.create_index(op.f('ix_query_users_approved_by'), 'query_users', ['approved_by'], unique=False)
    op.create_index(op.f('ix_query_users_default_department_id'), 'query_users', ['default_department_id'], unique=False)
    
    # 創建 file_permissions 表
    op.create_table(
        'file_permissions',
        sa.Column('id', sa.Integer(), nullable=False, comment='權限 ID'),
        sa.Column('query_user_id', sa.Integer(), nullable=False, comment='查詢用戶 ID'),
        sa.Column('file_id', sa.Integer(), nullable=False, comment='文件 ID'),
        sa.Column('granted_by', sa.Integer(), nullable=True, comment='授權人 ID（後台管理員）'),
        sa.Column('granted_at', sa.DateTime(), nullable=False, comment='授權時間'),
        sa.Column('notes', sa.Text(), nullable=True, comment='權限備註'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['query_user_id'], ['query_users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['granted_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        comment='查詢用戶文件訪問權限表'
    )
    
    # 創建索引
    op.create_index(op.f('ix_file_permissions_query_user_id'), 'file_permissions', ['query_user_id'], unique=False)
    op.create_index(op.f('ix_file_permissions_file_id'), 'file_permissions', ['file_id'], unique=False)
    op.create_index(op.f('ix_file_permissions_granted_by'), 'file_permissions', ['granted_by'], unique=False)
    
    # 創建唯一約束：一個用戶對一個文件只能有一個權限記錄
    op.create_unique_constraint(
        'uq_file_permissions_user_file',
        'file_permissions',
        ['query_user_id', 'file_id']
    )


def downgrade() -> None:
    # 刪除 file_permissions 表
    op.drop_index(op.f('ix_file_permissions_granted_by'), table_name='file_permissions')
    op.drop_index(op.f('ix_file_permissions_file_id'), table_name='file_permissions')
    op.drop_index(op.f('ix_file_permissions_query_user_id'), table_name='file_permissions')
    op.drop_table('file_permissions')
    
    # 刪除 query_users 表
    op.drop_index(op.f('ix_query_users_default_department_id'), table_name='query_users')
    op.drop_index(op.f('ix_query_users_approved_by'), table_name='query_users')
    op.drop_index(op.f('ix_query_users_email'), table_name='query_users')
    op.drop_index(op.f('ix_query_users_username'), table_name='query_users')
    op.drop_table('query_users')
