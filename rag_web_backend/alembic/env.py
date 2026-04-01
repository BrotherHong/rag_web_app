"""Alembic 遷移環境配置 - 支援 Async SQLAlchemy"""

import asyncio
import sys
from logging.config import fileConfig

import sqlalchemy as sa
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Windows 平台修正：設定為 SelectorEventLoop
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# 匯入專案配置
from app.config import settings
from app.core.database import Base
from app.models import *  # 匯入所有模型以支援 autogenerate

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# 設定資料庫 URL - 直接使用 asyncpg
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode with async support."""

    def ensure_alembic_version_storage(connection: Connection) -> None:
        """Ensure alembic_version.version_num can store long revision IDs.

        Alembic's default version table uses VARCHAR(32). This project uses
        descriptive revision IDs (e.g. 20260326_add_department_login_methods)
        that may exceed 32 characters, causing Postgres to raise
        StringDataRightTruncationError when writing alembic_version.
        """

        if connection.dialect.name != "postgresql":
            return

        inspector = sa.inspect(connection)

        with connection.begin():
            if not inspector.has_table("alembic_version"):
                meta = sa.MetaData()
                sa.Table(
                    "alembic_version",
                    meta,
                    sa.Column("version_num", sa.String(length=255), primary_key=True),
                ).create(connection)
                return

            columns = inspector.get_columns("alembic_version")
            version_col = next((c for c in columns if c.get("name") == "version_num"), None)
            if not version_col:
                return

            col_type = version_col.get("type")
            col_len = getattr(col_type, "length", None)
            if col_len is not None and col_len < 255:
                connection.execute(
                    sa.text(
                        "ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255)"
                    )
                )
    
    def do_run_migrations(connection: Connection) -> None:
        ensure_alembic_version_storage(connection)
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()

    async def run_async_migrations() -> None:
        """建立 async engine 並執行遷移"""
        connectable = async_engine_from_config(
            config.get_section(config.config_ini_section, {}),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )

        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)

        await connectable.dispose()

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
