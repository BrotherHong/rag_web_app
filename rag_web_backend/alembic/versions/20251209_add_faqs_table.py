"""Add FAQs table

Revision ID: 20251209_add_faqs_table
Revises: e4b73360d110
Create Date: 2025-12-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251209_add_faqs_table'
down_revision: Union[str, Sequence[str], None] = 'e4b73360d110'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'faqs',
        sa.Column('id', sa.Integer(), nullable=False, comment='FAQ ID'),
        sa.Column('department_id', sa.Integer(), nullable=True, comment='處室 ID'),
        sa.Column('category', sa.String(length=100), nullable=False, comment='分類'),
        sa.Column('question', sa.String(length=500), nullable=False, comment='問題'),
        sa.Column('description', sa.String(length=500), nullable=True, comment='問題描述（用於卡片顯示）'),
        sa.Column('answer', sa.Text(), nullable=True, comment='詳細解答'),
        sa.Column('icon', sa.String(length=10), nullable=True, comment='圖示 emoji'),
        sa.Column('order', sa.Integer(), nullable=False, comment='排序順序'),
        sa.Column('is_active', sa.Boolean(), nullable=False, comment='是否啟用'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, comment='建立時間'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, comment='更新時間'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='CASCADE'),
    )
    op.create_index(op.f('ix_faqs_category'), 'faqs', ['category'], unique=False)
    op.create_index(op.f('ix_faqs_department_id'), 'faqs', ['department_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_faqs_department_id'), table_name='faqs')
    op.drop_index(op.f('ix_faqs_category'), table_name='faqs')
    op.drop_table('faqs')
