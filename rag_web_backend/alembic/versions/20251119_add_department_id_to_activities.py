"""add_department_id_to_activities

Revision ID: 20251119_add_dept
Revises: 20251119_fix_enum
Create Date: 2025-11-19 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251119_add_dept'
down_revision: Union[str, Sequence[str], None] = '20251119_fix_enum'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add department_id to activities table"""
    
    # 添加 department_id 欄位
    op.add_column('activities', 
        sa.Column('department_id', sa.Integer(), nullable=True, comment='關聯處室 ID (活動發生的處室,用於代理模式)')
    )
    
    # 添加外鍵約束
    op.create_foreign_key(
        'fk_activities_department_id',
        'activities', 'departments',
        ['department_id'], ['id'],
        ondelete='SET NULL'
    )
    
    # 添加索引以提升查詢效能
    op.create_index(
        'ix_activities_department_id',
        'activities',
        ['department_id']
    )
    
    # 更新現有記錄：將活動的 department_id 設為該活動使用者所屬的處室
    op.execute("""
        UPDATE activities a
        SET department_id = u.department_id
        FROM users u
        WHERE a.user_id = u.id
        AND u.department_id IS NOT NULL
    """)


def downgrade() -> None:
    """Remove department_id from activities table"""
    
    # 移除索引
    op.drop_index('ix_activities_department_id', 'activities')
    
    # 移除外鍵約束
    op.drop_constraint('fk_activities_department_id', 'activities', type_='foreignkey')
    
    # 移除欄位
    op.drop_column('activities', 'department_id')
