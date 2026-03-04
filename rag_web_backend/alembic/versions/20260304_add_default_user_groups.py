"""add default user groups to existing departments

Revision ID: 20260304_add_default_user_groups
Revises: 20260302_reset_token
Create Date: 2026-03-04 00:00:00.000000

為每個現有處室補建兩個預設身分組：
- 一般登入：透過查詢網站一般註冊的用戶
- 成功入口登入：透過成功入口登入的用戶
"""
from datetime import datetime
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '20260304_add_default_user_groups'
down_revision = '20260302_reset_token'
branch_labels = None
depends_on = None

DEFAULT_GROUPS = [
    {
        "name": "一般登入",
        "description": "透過查詢網站一般註冊的用戶",
        "color": "#3B82F6",
        "priority": 100,
    },
    {
        "name": "成功入口登入",
        "description": "透過成功入口登入的用戶",
        "color": "#10B981",
        "priority": 90,
    },
]


def upgrade():
    conn = op.get_bind()
    now = datetime.utcnow()

    # 取得所有處室 ID
    departments = conn.execute(text("SELECT id FROM departments")).fetchall()

    for (dept_id,) in departments:
        for group in DEFAULT_GROUPS:
            # 若該處室已有同名身分組，跳過（冪等）
            exists = conn.execute(
                text(
                    "SELECT 1 FROM user_groups "
                    "WHERE department_id = :dept_id AND name = :name LIMIT 1"
                ),
                {"dept_id": dept_id, "name": group["name"]}
            ).fetchone()

            if not exists:
                conn.execute(
                    text(
                        "INSERT INTO user_groups "
                        "(department_id, name, description, color, priority, created_at, updated_at) "
                        "VALUES (:dept_id, :name, :desc, :color, :priority, :now, :now)"
                    ),
                    {
                        "dept_id": dept_id,
                        "name": group["name"],
                        "desc": group["description"],
                        "color": group["color"],
                        "priority": group["priority"],
                        "now": now,
                    }
                )


def downgrade():
    conn = op.get_bind()
    for group in DEFAULT_GROUPS:
        conn.execute(
            text("DELETE FROM user_groups WHERE name = :name"),
            {"name": group["name"]}
        )
