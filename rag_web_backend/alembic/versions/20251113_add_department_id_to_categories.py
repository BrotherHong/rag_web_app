"""add department_id and color to categories

Revision ID: 20251113_add_dept
Revises: 856c4de31348
Create Date: 2025-11-13 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251113_add_dept'
down_revision: Union[str, None] = '856c4de31348'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 添加 color 欄位（如果不存在）
    op.add_column('categories', sa.Column('color', sa.String(length=20), nullable=False, server_default='#3B82F6', comment='分類顏色'))
    
    # 添加 department_id 欄位（允許 NULL，因為可能還沒有 department 資料）
    op.add_column('categories', sa.Column('department_id', sa.Integer(), nullable=True, comment='處室 ID'))
    
    # 添加外鍵約束（允許 NULL）
    op.create_foreign_key(
        'fk_categories_department_id',
        'categories', 'departments',
        ['department_id'], ['id'],
        ondelete='CASCADE'
    )
    
    # 添加索引
    op.create_index('ix_categories_department_id', 'categories', ['department_id'])


def downgrade() -> None:
    # 移除索引
    op.drop_index('ix_categories_department_id', table_name='categories')
    
    # 移除外鍵
    op.drop_constraint('fk_categories_department_id', 'categories', type_='foreignkey')
    
    # 移除欄位
    op.drop_column('categories', 'department_id')
    op.drop_column('categories', 'color')
