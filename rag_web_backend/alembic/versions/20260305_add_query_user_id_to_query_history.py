"""add query_user_id to query_history

Revision ID: 20260305_add_query_user_id
Revises: 20260304_add_default_user_groups
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260305_add_query_user_id'
down_revision = '20260304_add_default_user_groups'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add query_user_id column
    op.add_column(
        'query_history',
        sa.Column('query_user_id', sa.Integer(), nullable=True, comment='查詢用戶 ID（前端用戶）')
    )
    
    # Create foreign key constraint
    op.create_foreign_key(
        'fk_query_history_query_user_id',
        'query_history',
        'query_users',
        ['query_user_id'],
        ['id'],
        ondelete='SET NULL'
    )
    
    # Create index for better query performance
    op.create_index(
        op.f('ix_query_history_query_user_id'),
        'query_history',
        ['query_user_id'],
        unique=False
    )
    
    # Migrate existing data from extra_data JSON to query_user_id column
    # Only update records where the query_user_id exists in query_users table
    op.execute("""
        UPDATE query_history qh
        SET query_user_id = CAST(qh.extra_data->>'query_user_id' AS INTEGER)
        FROM query_users qu
        WHERE qh.extra_data->>'query_user_id' IS NOT NULL
        AND CAST(qh.extra_data->>'query_user_id' AS INTEGER) = qu.id
    """)


def downgrade() -> None:
    # Drop index first
    op.drop_index(op.f('ix_query_history_query_user_id'), table_name='query_history')
    
    # Drop foreign key
    op.drop_constraint('fk_query_history_query_user_id', 'query_history', type_='foreignkey')
    
    # Drop column
    op.drop_column('query_history', 'query_user_id')
