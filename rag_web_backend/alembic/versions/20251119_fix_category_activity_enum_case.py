"""fix_category_activity_enum_case

Revision ID: 20251119_fix_enum
Revises: 165ed8fc21fe
Create Date: 2025-11-19 21:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251119_fix_enum'
down_revision: Union[str, Sequence[str], None] = '1e1e10457f8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - 修正分類活動類型為大寫"""
    
    # 使用獨立的連接來添加 enum 值（必須在單獨的事務中）
    connection = op.get_bind()
    
    # 添加大寫版本的 enum 值（每個都需要獨立事務）
    connection.execute(sa.text("COMMIT"))
    connection.execute(sa.text("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'CREATE_CATEGORY'"))
    
    connection.execute(sa.text("COMMIT"))
    connection.execute(sa.text("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'UPDATE_CATEGORY'"))
    
    connection.execute(sa.text("COMMIT"))
    connection.execute(sa.text("ALTER TYPE activitytype ADD VALUE IF NOT EXISTS 'DELETE_CATEGORY'"))
    
    # 開始新事務進行數據更新
    connection.execute(sa.text("BEGIN"))
    
    # 更新現有記錄（如果有的話）
    connection.execute(sa.text("""
        UPDATE activities 
        SET activity_type = 'CREATE_CATEGORY' 
        WHERE activity_type = 'create_category'
    """))
    
    connection.execute(sa.text("""
        UPDATE activities 
        SET activity_type = 'UPDATE_CATEGORY' 
        WHERE activity_type = 'update_category'
    """))
    
    connection.execute(sa.text("""
        UPDATE activities 
        SET activity_type = 'DELETE_CATEGORY' 
        WHERE activity_type = 'delete_category'
    """))


def downgrade() -> None:
    """Downgrade schema"""
    # 恢復為小寫（如果需要）
    op.execute("""
        UPDATE activities 
        SET activity_type = 'create_category' 
        WHERE activity_type = 'CREATE_CATEGORY'
    """)
    
    op.execute("""
        UPDATE activities 
        SET activity_type = 'update_category' 
        WHERE activity_type = 'UPDATE_CATEGORY'
    """)
    
    op.execute("""
        UPDATE activities 
        SET activity_type = 'delete_category' 
        WHERE activity_type = 'DELETE_CATEGORY'
    """)
