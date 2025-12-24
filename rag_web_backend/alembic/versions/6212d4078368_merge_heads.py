"""merge heads

Revision ID: 6212d4078368
Revises: 20251209_add_faqs_table, 20251217_qh_user_nullable
Create Date: 2025-12-17 15:30:06.914239

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6212d4078368'
down_revision: Union[str, Sequence[str], None] = ('20251209_add_faqs_table', '20251217_qh_user_nullable')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
