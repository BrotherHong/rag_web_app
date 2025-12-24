"""add slug to departments

Revision ID: 20251224_add_slug
Revises: 20251217_qh_user_nullable
Create Date: 2025-12-24 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251224_add_slug'
down_revision: Union[str, Sequence[str], None] = '6212d4078368'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 添加 slug 欄位到 departments 表
    op.add_column('departments', sa.Column('slug', sa.String(length=50), nullable=True, comment='URL 友善識別碼'))
    
    # 為現有的部門生成 slug 值
    # 使用 name 的小寫版本作為臨時 slug
    op.execute("""
        UPDATE departments 
        SET slug = LOWER(REPLACE(name, ' ', '-'))
        WHERE slug IS NULL
    """)
    
    # 將 slug 欄位改為 NOT NULL
    op.alter_column('departments', 'slug', nullable=False)
    
    # 添加唯一索引
    op.create_index(op.f('ix_departments_slug'), 'departments', ['slug'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    # 移除索引
    op.drop_index(op.f('ix_departments_slug'), table_name='departments')
    
    # 移除 slug 欄位
    op.drop_column('departments', 'slug')
