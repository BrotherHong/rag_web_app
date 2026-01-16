"""add is_public field to files table

Revision ID: 20260115_add_file_is_public
Revises: 20260115_add_query_users
Create Date: 2026-01-15

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260115_add_file_is_public'
down_revision = '20260115_add_query_users'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 添加 is_public 欄位
    op.add_column('files', sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false', comment='是否為公開文件（訪客可訪問）'))
    
    # 創建索引以提升查詢性能
    op.create_index(op.f('ix_files_is_public'), 'files', ['is_public'], unique=False)


def downgrade() -> None:
    # 刪除索引
    op.drop_index(op.f('ix_files_is_public'), table_name='files')
    
    # 刪除欄位
    op.drop_column('files', 'is_public')
