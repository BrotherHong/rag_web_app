"""add file processing fields

Revision ID: 20240115_processing
Revises: 049f32709ba2
Create Date: 2024-01-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20240115_processing'
down_revision: Union[str, None] = '049f32709ba2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 添加 original_filename 欄位
    op.add_column('files', sa.Column('original_filename', sa.String(length=255), nullable=True))
    
    # 將現有的 filename 複製到 original_filename
    op.execute('UPDATE files SET original_filename = filename')
    
    # 設為 NOT NULL
    op.alter_column('files', 'original_filename', nullable=False)
    
    # 添加 mime_type 欄位
    op.add_column('files', sa.Column('mime_type', sa.String(length=100), nullable=True))
    
    # 添加 description 欄位
    op.add_column('files', sa.Column('description', sa.Text(), nullable=True))
    
    # 添加 vector_count 欄位
    op.add_column('files', sa.Column('vector_count', sa.Integer(), nullable=False, server_default='0'))
    
    # 添加處理進度追蹤欄位
    op.add_column('files', sa.Column('processing_step', sa.String(length=50), nullable=True))
    op.add_column('files', sa.Column('processing_progress', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('files', sa.Column('processing_started_at', sa.DateTime(), nullable=True))
    op.add_column('files', sa.Column('processing_completed_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    # 移除添加的欄位
    op.drop_column('files', 'processing_completed_at')
    op.drop_column('files', 'processing_started_at')
    op.drop_column('files', 'processing_progress')
    op.drop_column('files', 'processing_step')
    op.drop_column('files', 'vector_count')
    op.drop_column('files', 'description')
    op.drop_column('files', 'mime_type')
    op.drop_column('files', 'original_filename')
